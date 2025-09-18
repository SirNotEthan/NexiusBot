import { 
    ChatInputCommandInteraction, 
    StringSelectMenuInteraction,
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
    PermissionFlagsBits,
    Guild
} from 'discord.js';
import Database from '../../database/database';
import { cooldownManager } from '../../utils/cooldownManager';
import { getFreeCarryLimit, getGameDisplayName as getConfigGameDisplayName } from '../../config/freeCarriesConfig';
import { botLogger } from '../../utils/logger';
import { safeReply, safeEditReply, safeDeferReply, isInteractionValid } from '../../utils/interactionUtils';

function getGameDisplayName(gameCode: string): string {
    return getConfigGameDisplayName(gameCode);
}

function getGameCategoryId(game: string, type: 'regular' | 'paid'): string | undefined {
    const gamePrefix = game.toUpperCase();
    const typePrefix = type.toUpperCase();
    const envVar = `${gamePrefix}_${typePrefix}_CATEGORY_ID`;
    
    return process.env[envVar];
}

function getGameHelperRoleId(game: string): string | undefined {
    const gamePrefix = game.toUpperCase();
    const envVar = `${gamePrefix}_HELPER_ROLE_ID`;
    
    return process.env[envVar];
}

interface VouchTicketData {
    game?: string;
    gamemode?: string;
    goal?: string;
    canJoinLinks?: boolean;
    type: 'regular' | 'paid';
    selectedHelper?: string;
    needsAtomicIncrement?: boolean;
    slotReserved?: boolean;
}

const data = new SlashCommandBuilder()
    .setName("request-carry")
    .setDescription("Request a carry for help")
    .addStringOption(option =>
        option.setName('type')
            .setDescription('Type of carry to request')
            .setRequired(true)
            .addChoices(
                { name: 'Regular Help', value: 'regular' },
                { name: 'Paid Help', value: 'paid' }
            )
    )
    .addStringOption(option =>
        option.setName('game')
            .setDescription('Which game you need help with')
            .setRequired(true)
            .addChoices(
                { name: 'Anime Last Stand', value: 'als' },
                { name: 'Anime Vanguard', value: 'av' }
            )
    );

async function checkFreeCarryEligibility(userId: string, game: string, gamemode: string): Promise<{eligible: boolean, reason?: string, limit?: number, used?: number}> {
    const db = new Database();
    await db.connect();
    
    try {
        console.log(`[FREE_CARRY_CHECK] Checking eligibility for user ${userId}, game ${game}, gamemode ${gamemode}`);
        
        const messageStats = await db.getUserMessageStats(userId);
        
        if (!messageStats) {
            console.log(`[FREE_CARRY_CHECK] No message stats found for user ${userId}`);
            return { eligible: false, reason: 'No message activity found today' };
        }
        
        const hasEnoughMessages = messageStats.message_count >= 50;
        if (!hasEnoughMessages) {
            console.log(`[FREE_CARRY_CHECK] User ${userId} has insufficient messages: ${messageStats.message_count}/50`);
            return { eligible: false, reason: `Need at least 50 messages today (currently ${messageStats.message_count})` };
        }
        
        const gamemodeLimit = getFreeCarryLimit(game, gamemode);
        if (gamemodeLimit === 0) {
            console.log(`[FREE_CARRY_CHECK] Gamemode ${gamemode} for game ${game} does not support free carries`);
            return { eligible: false, reason: 'This gamemode does not support free carries' };
        }
        
        const usage = await db.getFreeCarryUsage(userId, game, gamemode);
        const currentUsage = usage ? usage.usage_count : 0;
        console.log(`[FREE_CARRY_CHECK] User ${userId} current usage for ${game}/${gamemode}: ${currentUsage}/${gamemodeLimit}`);
        
        const hasRequestsRemaining = currentUsage < gamemodeLimit;
        
        const result = { 
            eligible: hasRequestsRemaining,
            reason: hasRequestsRemaining ? undefined : `Daily limit reached for this gamemode (${currentUsage}/${gamemodeLimit})`,
            limit: gamemodeLimit,
            used: currentUsage
        };
        
        console.log(`[FREE_CARRY_CHECK] Eligibility result for user ${userId}: ${JSON.stringify(result)}`);
        return result;
    } finally {
        await db.close();
    }
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        if (!isInteractionValid(interaction)) {
            console.warn('Interaction expired, cannot process carry request');
            return;
        }

        if (cooldownManager.isOnCooldown(interaction.user.id, 'carry_request')) {
            const remainingTime = cooldownManager.getRemainingCooldown(interaction.user.id, 'carry_request');
            const timeString = cooldownManager.formatRemainingTime(remainingTime);
            
            await safeReply(interaction, {
                content: `⏰ **Please wait ${timeString}** before creating another carry request.\n\n*This prevents request spam and helps us manage the queue efficiently.*`,
                ephemeral: true
            });
            return;
        }

        const ticketType = interaction.options.getString('type', true) as 'regular' | 'paid';

        if (ticketType === 'paid') {
            await safeReply(interaction, {
                content: `🚫 **Paid Help is currently disabled.**\n\nPaid tickets are temporarily unavailable while we work on improvements. Please use **Regular Help** instead or try again later.\n\n*Thank you for your understanding!*`,
                ephemeral: true
            });
            return;
        }

        const deferred = await safeDeferReply(interaction, { ephemeral: true });
        if (!deferred) return; 
        
        const game = interaction.options.getString('game', true);
        
        const ticketData: VouchTicketData = {
            type: ticketType,
            game: game
        };

        await showTicketForm(interaction, ticketData);
    } catch (error) {
        console.error("Error in request-carry command:", error);
        await handleTicketError(interaction, error);
    }
}

async function showPaidHelperSelection(interaction: ChatInputCommandInteraction, ticketData: VouchTicketData): Promise<void> {
    const db = new Database();
    await db.connect();
    
    try {
        const paidHelpers = await db.getActivePaidHelpers();
        
        if (paidHelpers.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle("❌ No Paid Helpers Available")
                .setDescription("There are currently no paid helpers available. Please contact staff or try regular help instead.")
                .setColor(0xff6b6b)
                .addFields([
                    { name: "💡 Note", value: "Paid helpers are registered by staff. Ask an administrator to add paid helpers using `/manage-paid-helpers add`.", inline: false }
                ]);
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("💳 Select a Paid Helper")
            .setDescription("Choose a paid helper from the list below:")
            .setColor(0x5865f2);

        const options = paidHelpers.slice(0, 25).map(helper => {
            const helperData = `${helper.user_tag} | ${helper.bio.substring(0, 50)}${helper.bio.length > 50 ? '...' : ''}`;
            return new StringSelectMenuOptionBuilder()
                .setLabel(helper.user_tag)
                .setDescription(helper.bio.substring(0, 100))
                .setValue(helper.user_id);
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`paid_helper_select_${interaction.user.id}_${ticketData.game}`)
            .setPlaceholder('Choose a paid helper...')
            .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        await interaction.editReply({
            embeds: [embed],
            components: [row]
        });

    } finally {
        await db.close();
    }
}

async function showTicketForm(interaction: ChatInputCommandInteraction | StringSelectMenuInteraction, ticketData: VouchTicketData): Promise<void> {
    if (!isInteractionValid(interaction)) {
        console.warn('Interaction expired, cannot show ticket form');
        return;
    }

    const embed = createVouchTicketEmbed(ticketData);
    const components = createVouchTicketComponents(ticketData, interaction.user.id);

    if (interaction.replied || interaction.deferred) {
        await safeEditReply(interaction, {
            embeds: [embed],
            components: components
        });
    } else {
        await safeReply(interaction, {
            embeds: [embed],
            components: components,
            ephemeral: true
        });
    }
}

function createVouchTicketEmbed(ticketData: VouchTicketData): EmbedBuilder {
    const completedFields = [
        ticketData.game,
        ticketData.gamemode, 
        ticketData.goal, 
        ticketData.canJoinLinks !== undefined
    ].filter(Boolean).length;
    
    const totalFields = 4;
    const progressBar = "▓".repeat(completedFields) + "░".repeat(totalFields - completedFields);
    
    const embed = new EmbedBuilder()
        .setTitle(`${ticketData.type === 'paid' ? '💳' : '🎫'} Request ${ticketData.type === 'paid' ? 'Paid' : 'Regular'} Carry`)
        .setDescription(`**Progress:** ${completedFields}/${totalFields} ${progressBar}\n\n*Fill out the form below to request your carry.*`)
        .setColor(completedFields === totalFields ? 0x00ff00 : 0x5865f2)
        .addFields([
            {
                name: "🎲 **Game**",
                value: ticketData.game ? `\`${getGameDisplayName(ticketData.game)}\`` : "❌ *Not set*",
                inline: true
            },
            {
                name: "🎮 **Gamemode**",
                value: ticketData.gamemode ? `\`${ticketData.gamemode}\`` : "❌ *Not set*",
                inline: true
            },
            {
                name: "🎯 **Goal**",
                value: ticketData.goal 
                    ? (ticketData.goal.length > 50 ? `\`${ticketData.goal.substring(0, 50)}...\`` : `\`${ticketData.goal}\``)
                    : "❌ *Not set*",
                inline: true
            },
            {
                name: "🔗 **Can Join Links**",
                value: ticketData.canJoinLinks !== undefined 
                    ? (ticketData.canJoinLinks ? "✅ Yes" : "❌ No")
                    : "❌ *Not set*",
                inline: true
            }
        ]);

    if (ticketData.selectedHelper) {
        embed.addFields([
            {
                name: "👤 **Selected Helper**",
                value: `<@${ticketData.selectedHelper}>`,
                inline: true
            }
        ]);
    }

    embed.setFooter({ 
        text: completedFields === totalFields 
            ? "✅ All fields completed! Ready to request carry." 
            : `⏳ ${totalFields - completedFields} field(s) remaining`
    }).setTimestamp();

    return embed;
}

function createVouchTicketComponents(ticketData: VouchTicketData, userId: string): ActionRowBuilder<any>[] {
    const isComplete = ticketData.game && ticketData.gamemode && ticketData.goal && ticketData.canJoinLinks !== undefined;

    const getGamemodeOptions = (game?: string) => {
        if (game === 'av') {
            return [
                { label: 'Story', value: 'story' },
                { label: 'Legend Stages', value: 'legend-stages' },
                { label: 'Rift', value: 'rift' },
                { label: 'Inf', value: 'inf' },
                { label: 'Raids', value: 'raids' },
                { label: 'SJW Dungeon', value: 'sjw-dungeon' }
            ];
        } else if (game === 'als') {
            return [
                { label: 'Story', value: 'story' },
                { label: 'Legend Stages', value: 'legend-stages' },
                { label: 'Raids', value: 'raids' },
                { label: 'Dungeons', value: 'dungeons' },
                { label: 'Survival', value: 'survival' },
                { label: 'Breach', value: 'breach' },
                { label: 'Portals', value: 'portals' }
            ];
        }
        return [];
    };

    const gamemodeOptions = getGamemodeOptions(ticketData.game);
    const rows: ActionRowBuilder<any>[] = [];
    
    if (gamemodeOptions.length > 0) {
        const gamemodeSelect = new StringSelectMenuBuilder()
            .setCustomId(`vouch_gamemode_${userId}`)
            .setPlaceholder('Select a gamemode...')
            .addOptions(gamemodeOptions.map(option => 
                new StringSelectMenuOptionBuilder()
                    .setLabel(option.label)
                    .setValue(option.value)
            ));

        const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gamemodeSelect);
        rows.push(row1);
    }

    const buttonRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents([
        new ButtonBuilder()
            .setCustomId(`vouch_goal_${userId}`)
            .setLabel('Set Goal')
            .setEmoji('🎯')
            .setStyle(ticketData.goal ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`vouch_links_yes_${userId}`)
            .setLabel('Can Join Links')
            .setEmoji('✅')
            .setStyle(ticketData.canJoinLinks === true ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`vouch_links_no_${userId}`)
            .setLabel('Cannot Join Links')
            .setEmoji('❌')
            .setStyle(ticketData.canJoinLinks === false ? ButtonStyle.Success : ButtonStyle.Secondary)
    ]);

    const buttonRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents([
        new ButtonBuilder()
            .setCustomId(`vouch_create_${userId}`)
            .setLabel('Request Carry')
            .setEmoji('📨')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!isComplete),
        new ButtonBuilder()
            .setCustomId(`vouch_cancel_${userId}`)
            .setLabel('Cancel')
            .setEmoji('🚫')
            .setStyle(ButtonStyle.Danger)
    ]);

    rows.push(buttonRow1, buttonRow2);

    return rows;
}

export async function createVouchTicket(
    guild: Guild, 
    ticketData: VouchTicketData, 
    userId: string,
    userTag: string
): Promise<string> {
    const db = new Database();
    await db.connect();
    
    try {
        const ticketNumber = await db.getNextTicketNumber(ticketData.game!);
        const categoryId = getGameCategoryId(ticketData.game!, ticketData.type);
        
        if (!categoryId) {
            throw new Error(`${ticketData.type === 'paid' ? 'Paid' : 'Regular'} tickets category ID for ${getGameDisplayName(ticketData.game!)} not configured`);
        }

        const gameName = ticketData.game === 'av' ? 'av' : ticketData.game === 'als' ? 'als' : ticketData.game!;
        const channelName = `${ticketData.type}-${gameName}-${ticketNumber}`;
        
        const permissionOverwrites = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            {
                id: userId,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            }
        ];

        const gameHelperRoleId = getGameHelperRoleId(ticketData.game!);
        if (gameHelperRoleId) {
            permissionOverwrites.push({
                id: gameHelperRoleId,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            });
        }

        if (ticketData.type === 'paid' && ticketData.selectedHelper) {
            permissionOverwrites.push({
                id: ticketData.selectedHelper,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
            });
        }

        const ticketChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: categoryId,
            permissionOverwrites,
        });

        const ticketRecord = await db.createTicket({
            ticket_number: ticketNumber,
            user_id: userId,
            user_tag: userTag,
            channel_id: ticketChannel.id,
            game: ticketData.game!,
            gamemode: ticketData.gamemode!,
            goal: ticketData.goal!,
            contact: ticketData.canJoinLinks ? 'Can join links' : 'Cannot join links',
            status: ticketData.type === 'paid' && ticketData.selectedHelper ? 'claimed' : 'open' as const,
            type: ticketData.type,
            claimed_by: ticketData.type === 'paid' ? ticketData.selectedHelper : undefined,
            claimed_by_tag: ticketData.type === 'paid' && ticketData.selectedHelper ? 'Selected Helper' : undefined
        });

        await botLogger.logTicketCreated(ticketNumber, userId, ticketData.type, ticketData.game!);

        if (ticketData.type === 'regular') {
            if (ticketData.slotReserved) {
                // Slot already atomically reserved in button handler - no further action needed
                console.log(`[TICKET_CREATE] Slot already reserved for user ${userId}, game ${ticketData.game}, gamemode ${ticketData.gamemode}`);
            } else if (ticketData.needsAtomicIncrement) {
                // Legacy path: Use atomic increment to prevent race conditions
                const gamemodeLimit = getFreeCarryLimit(ticketData.game!, ticketData.gamemode!);
                const incrementResult = await db.tryIncrementFreeCarryUsage(userId, userTag, ticketData.game!, ticketData.gamemode!, gamemodeLimit);
                
                if (!incrementResult.success) {
                    console.error(`[RACE_CONDITION] Failed to atomically increment usage for user ${userId}, game ${ticketData.game}, gamemode ${ticketData.gamemode}. Current usage: ${incrementResult.currentUsage}/${gamemodeLimit}`);
                    throw new Error(`Free carry limit reached during ticket creation. Current usage: ${incrementResult.currentUsage}/${gamemodeLimit}`);
                }
                
                console.log(`[ATOMIC_INCREMENT] Successfully incremented usage for user ${userId}, game ${ticketData.game}, gamemode ${ticketData.gamemode}. New usage: ${incrementResult.currentUsage}/${gamemodeLimit}`);
            } else {
                // Fallback to regular increment for backward compatibility
                await db.incrementFreeCarryUsage(userId, userTag, ticketData.game!, ticketData.gamemode!);
            }
            await db.incrementFreeCarryRequests(userId);
        }

        const embed = new EmbedBuilder()
            .setTitle(`${ticketData.type === 'paid' ? '💳' : '🎫'} Carry Request #${ticketNumber}`)
            .setDescription(`**Request created by:** <@${userId}>\n**Type:** ${ticketData.type === 'paid' ? 'Paid Help' : 'Regular Help'}${ticketData.type === 'paid' && ticketData.selectedHelper ? '\n**Status:** 🔍 Assigned' : ''}`)
            .addFields([
                { name: '🎲 Game', value: getGameDisplayName(ticketData.game!), inline: true },
                { name: '🎮 Gamemode', value: ticketData.gamemode!, inline: true },
                { name: '🎯 Goal', value: ticketData.goal!, inline: true },
                { name: '🔗 Can Join Links', value: ticketData.canJoinLinks ? 'Yes' : 'No', inline: true }
            ])
            .setColor(ticketData.type === 'paid' && ticketData.selectedHelper ? 0x00d4aa : ticketData.type === 'paid' ? 0xffa500 : 0x5865f2)
            .setTimestamp();

        if (ticketData.selectedHelper) {
            embed.addFields([
                { name: '👤 Selected Helper', value: `<@${ticketData.selectedHelper}>`, inline: true }
            ]);
        }

        let buttons;
        if (ticketData.type === 'paid' && ticketData.selectedHelper) {
            buttons = new ActionRowBuilder<ButtonBuilder>().addComponents([
                new ButtonBuilder()
                    .setCustomId(`ring_helper_${ticketNumber}`)
                    .setLabel('Ring Helper')
                    .setEmoji('🔔')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`unclaim_ticket_${ticketNumber}`)
                    .setLabel('Unclaim')
                    .setEmoji('🔓')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`close_ticket_${ticketNumber}`)
                    .setLabel('Close')
                    .setEmoji('🔒')
                    .setStyle(ButtonStyle.Danger)
            ]);
        } else {
            buttons = new ActionRowBuilder<ButtonBuilder>().addComponents([
                new ButtonBuilder()
                    .setCustomId(`claim_ticket_${ticketNumber}`)
                    .setLabel('Claim')
                    .setEmoji('🤝')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`ring_helper_${ticketNumber}`)
                    .setLabel('Ring Helper')
                    .setEmoji('🔔')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`unclaim_ticket_${ticketNumber}`)
                    .setLabel('Unclaim')
                    .setEmoji('🔓')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`close_ticket_${ticketNumber}`)
                    .setLabel('Close')
                    .setEmoji('🔒')
                    .setStyle(ButtonStyle.Danger)
            ]);
        }

        await ticketChannel.send({
            embeds: [embed],
            components: [buttons]
        });

        if (ticketData.type === 'paid' && ticketData.selectedHelper) {
            await ticketChannel.send(`<@${ticketData.selectedHelper}> - You have been selected for this paid help request! This ticket has been automatically assigned to you.`);
        } else {
            const gameHelperRoleId = getGameHelperRoleId(ticketData.game!);
            if (gameHelperRoleId) {
                await ticketChannel.send(`<@&${gameHelperRoleId}> - New ${ticketData.type} ${getGameDisplayName(ticketData.game!)} carry request created!`);
            } else {
                const helperRoleId = ticketData.type === 'paid' ? process.env.PAID_HELPER_ROLE_ID : process.env.HELPER_ROLE_ID;
                if (helperRoleId) {
                    await ticketChannel.send(`<@&${helperRoleId}> - New ${ticketData.type} carry request created!`);
                }
            }
        }

        return ticketChannel.id;
    } finally {
        await db.close();
    }
}


export function createGoalModal(userId: string): ModalBuilder {
    const modal = new ModalBuilder()
        .setCustomId(`vouch_goal_modal_${userId}`)
        .setTitle('Set Your Goal');

    const goalInput = new TextInputBuilder()
        .setCustomId('goal')
        .setLabel('What do you need help with?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Describe what you want to achieve...')
        .setMinLength(10)
        .setMaxLength(500)
        .setRequired(true);

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(goalInput);
    modal.addComponents(firstActionRow);

    return modal;
}

async function handleTicketError(interaction: ChatInputCommandInteraction, error: any): Promise<void> {
    console.error("Carry request command error:", error);
    
    if (!isInteractionValid(interaction)) {
        console.warn('Interaction expired, cannot send error message');
        return;
    }
    
    try {
        const errorMessage = "❌ Failed to create carry request form. Please try again later.";
        
        if (interaction.replied || interaction.deferred) {
            await safeEditReply(interaction, { content: errorMessage });
        } else {
            await safeReply(interaction, { content: errorMessage, ephemeral: true });
        }
    } catch (followUpError) {
        console.error("Failed to send ticket error message:", followUpError);
    }
}

export default { data, execute };
export { VouchTicketData, showTicketForm, createVouchTicketEmbed, createVouchTicketComponents };