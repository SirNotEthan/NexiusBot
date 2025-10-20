import {
    ChatInputCommandInteraction,
    StringSelectMenuInteraction,
    SlashCommandBuilder,
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
    Guild,
    MessageFlags,
    TextDisplayBuilder,
    SeparatorBuilder,
    ContainerBuilder,
    EmbedBuilder
} from 'discord.js';
import Database from '../../database/database';
import { cooldownManager } from '../../utils/cooldownManager';
import { botLogger } from '../../utils/logger';
import { safeReply, safeEditReply, safeDeferReply, isInteractionValid } from '../../utils/interactionUtils';

function getGameDisplayName(gameCode: string): string {
    const gameNames: { [key: string]: string } = {
        'als': 'Anime Last Stand',
        'av': 'Anime Vanguards'
    };
    return gameNames[gameCode] || gameCode.toUpperCase();
}

function capitalizeFirstLetter(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
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

function getGamemodeOptions(game: string): { label: string; value: string }[] {
    if (game === 'av') {
        return [
            { label: '📖 Story', value: 'story' },
            { label: '👑 Infinite', value: 'inf' },
            { label: '🏆 Challenges', value: 'towers' },
            { label: '🌟 Legend', value: 'legend-stages' },
            { label: '🔥 Raid dungeons', value: 'dungeons' },
            { label: '🌀 Portal', value: 'portals' },
            { label: '🐉 Boss Raids', value: 'raids' },
            { label: '🌠 Rifts', value: 'rift' }
        ];
    } else if (game === 'als') {
        return [
            { label: '📚 Story', value: 'story' },
            { label: '♾️ Infinite', value: 'inf' },
            { label: '⚔️ Raids', value: 'raids' },
            { label: '🏆 Challenges', value: 'towers' },
            { label: '🎤 Portals', value: 'portals' },
            { label: '🪨 Cavens', value: 'breach' },
            { label: '👑 Legend Stages', value: 'legend-stages' },
            { label: '💀 Dungeons', value: 'dungeons' },
            { label: '🩹 Survival', value: 'survival' }
        ];
    }
    return [];
}

interface VouchTicketData {
    game?: string;
    gamemode?: string;
    goal?: string;
    canJoinLinks?: boolean;
    type: 'regular' | 'paid';
    selectedHelper?: string;
    robloxUsername?: string;
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
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const ticketType = interaction.options.getString('type', true) as 'regular' | 'paid';

        if (ticketType === 'paid') {
            await safeReply(interaction, {
                content: `🚫 **Paid Help is currently disabled.**\n\nPaid tickets are temporarily unavailable while we work on improvements. Please use **Regular Help** instead or try again later.\n\n*Thank you for your understanding!*`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const deferred = await safeDeferReply(interaction, { ephemeral: true });
        if (!deferred) return;

        if (ticketType === 'regular') {
            const db = new Database();
            await db.connect();

            try {
                const messageStats = await db.getUserMessageStats(interaction.user.id);
                const messageCount = messageStats?.message_count || 0;

                if (messageCount < 50) {
                    await safeEditReply(interaction, {
                        content: `❌ **Message Requirement Not Met**\n\nYou currently have **${messageCount}** messages today. You need at least **50 messages** to request a free carry.\n\n*Send more messages in the server and try again!*`
                    });
                    return;
                }
            } finally {
                await db.close();
            }
        }

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

async function showTicketForm(interaction: ChatInputCommandInteraction | StringSelectMenuInteraction, ticketData: VouchTicketData): Promise<void> {
    if (!isInteractionValid(interaction)) {
        console.warn('Interaction expired, cannot show ticket form');
        return;
    }

    const components = createVouchTicketComponents(ticketData, interaction.user.id);

    if (interaction.replied || interaction.deferred) {
        await safeEditReply(interaction, {
            components: components,
            flags: MessageFlags.IsComponentsV2
        });
    } else {
        await safeReply(interaction, {
            components: components,
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
    }
}

async function showTicketFormWithUpdate(interaction: StringSelectMenuInteraction, ticketData: VouchTicketData): Promise<void> {
    if (!isInteractionValid(interaction)) {
        console.warn('Interaction expired, cannot show ticket form');
        return;
    }

    const components = createVouchTicketComponents(ticketData, interaction.user.id);

    await interaction.update({
        content: null,
        components: components,
        flags: MessageFlags.IsComponentsV2
    });
}

function createVouchTicketDisplay(ticketData: VouchTicketData): any[] {
    const completedFields = [
        ticketData.game,
        ticketData.gamemode,
        ticketData.goal,
        ticketData.canJoinLinks !== undefined
    ].filter(Boolean).length;

    const totalFields = 4;
    const components = [];

    // Header with professional messaging and game context
    const typeLabel = ticketData.type === 'paid' ? 'Paid' : 'Regular';
    const gameContext = ticketData.game ? ` for ${getGameDisplayName(ticketData.game)}` : '';
    const headerText = new TextDisplayBuilder()
        .setContent(`# Request ${typeLabel} Help${gameContext}\n**Fill out the form below to get assistance from our helper community**`);
    components.push(headerText);
    components.push(new SeparatorBuilder());

    // Form fields with clean display
    const gameDisplay = ticketData.game ? `\`\`${getGameDisplayName(ticketData.game)}\`\`` : 'Game will be selected based on your command choice';
    const gameSection = new TextDisplayBuilder()
        .setContent(`**Game**\n${gameDisplay}`);
    components.push(gameSection);

    if (ticketData.game) {
        const gamemodeDisplay = ticketData.gamemode ? `\`\`${ticketData.gamemode}\`\`` : 'Use the dropdown below to select your gamemode';
        const gamemodeSection = new TextDisplayBuilder()
            .setContent(`**Gamemode**\n${gamemodeDisplay}`);
        components.push(gamemodeSection);
    }

    const goalDisplay = ticketData.goal
        ? `\`\`${ticketData.goal.length > 100 ? `${ticketData.goal.substring(0, 100)}...` : ticketData.goal}\`\``
        : 'Click "Set Goal" to tell us what you need help with';
    const goalSection = new TextDisplayBuilder()
        .setContent(`**What do you need help with?**\n${goalDisplay}`);
    components.push(goalSection);

    const linksDisplay = ticketData.canJoinLinks !== undefined
        ? `\`\`${ticketData.canJoinLinks ? 'Yes - I can join links' : 'No - I cannot join links'}\`\``
        : 'Choose whether you can join links or if you need to add a helper';
    const linksSection = new TextDisplayBuilder()
        .setContent(`**Can you join links?**\n${linksDisplay}`);
    components.push(linksSection);

    if (ticketData.robloxUsername) {
        const robloxSection = new TextDisplayBuilder()
            .setContent(`**ROBLOX Username**\n\`\`\`${ticketData.robloxUsername}\`\`\``);
        components.push(robloxSection);
    }

    if (ticketData.selectedHelper) {
        const helperSection = new TextDisplayBuilder()
            .setContent(`**Selected Helper**\n\`\`<@${ticketData.selectedHelper}>\`\``);
        components.push(helperSection);
    }

    return components;
}

function createVouchTicketComponents(ticketData: VouchTicketData, userId: string): any[] {
    const allComponents = [];

    // Create main content container
    const mainContainer = new ContainerBuilder();
    if (!(mainContainer as any).components) {
        (mainContainer as any).components = [];
    }

    // Add all display components to the main container
    const displayComponents = createVouchTicketDisplay(ticketData);
    (mainContainer as any).components.push(...displayComponents);

    // Add separator before controls
    (mainContainer as any).components.push(new SeparatorBuilder());

    // Add interactive controls to the main container
    addControlsToContainer(mainContainer, ticketData, userId);

    // Add the main container to components
    allComponents.push(mainContainer);

    return allComponents;
}

function addControlsToContainer(container: ContainerBuilder, ticketData: VouchTicketData, userId: string): void {
    if (!(container as any).components) {
        (container as any).components = [];
    }
    const isComplete = ticketData.game && ticketData.gamemode && ticketData.goal && ticketData.canJoinLinks !== undefined;

    // Calculate completion for button labels
    const completedFields = [
        ticketData.game,
        ticketData.gamemode,
        ticketData.goal,
        ticketData.canJoinLinks !== undefined
    ].filter(Boolean).length;
    const totalFields = 4;

    const gamemodeOptions = getGamemodeOptions(ticketData.game);

    // Game/Gamemode selection - ensure we only add if there are valid options
    if (gamemodeOptions.length > 0) {
        const options = gamemodeOptions.map(option =>
            new StringSelectMenuOptionBuilder()
                .setLabel(option.label)
                .setValue(option.value)
        );

        // Ensure we have valid options before creating the select menu
        if (options.length > 0) {
            const placeholder = ticketData.gamemode
                ? `Selected: ${ticketData.gamemode} (click to change)`
                : 'Choose your gamemode...';

            const gamemodeSelect = new StringSelectMenuBuilder()
                .setCustomId(`request_carry_gamemode_${userId}_${ticketData.game}`)
                .setPlaceholder(placeholder)
                .addOptions(options);

            const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gamemodeSelect);
            // Only push if the row has valid components
            if (selectRow.components && selectRow.components.length > 0) {
                (container as any).components.push(selectRow);
            }
        }
    }

    // Action buttons row with professional labels
    const actionButtons = [
        new ButtonBuilder()
            .setCustomId(`request_carry_goal_${userId}`)
            .setLabel(ticketData.goal ? 'Edit Goal' : 'Set Goal')
            .setStyle(ticketData.goal ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`request_carry_links_yes_${userId}`)
            .setLabel('I can Join Links')
            .setStyle(ticketData.canJoinLinks === true ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`request_carry_helper_${userId}`)
            .setLabel('I need to add the helper')
            .setStyle(ticketData.robloxUsername ? ButtonStyle.Success : ButtonStyle.Secondary)
    ];

    // Ensure we have valid buttons before creating the row
    if (actionButtons.length > 0 && actionButtons.length <= 5) {
        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(actionButtons);
        // Only push if the row has valid components
        if (actionRow.components && actionRow.components.length > 0) {
            (container as any).components.push(actionRow);
        }
    }

    // Submit/Cancel buttons row with professional messaging
    const submitLabel = isComplete
        ? 'Create Help Request'
        : `Need ${totalFields - completedFields} more field${totalFields - completedFields !== 1 ? 's' : ''}`;

    const submitButtons = [
        new ButtonBuilder()
            .setCustomId(`request_carry_submit_${userId}`)
            .setLabel(submitLabel)
            .setStyle(isComplete ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!isComplete),
        new ButtonBuilder()
            .setCustomId(`request_carry_cancel_${userId}`)
            .setLabel('Cancel Request')
            .setStyle(ButtonStyle.Danger)
    ];

    // Ensure we have valid buttons before creating the row
    if (submitButtons.length > 0 && submitButtons.length <= 5) {
        const submitRow = new ActionRowBuilder<ButtonBuilder>().addComponents(submitButtons);
        // Only push if the row has valid components
        if (submitRow.components && submitRow.components.length > 0) {
            (container as any).components.push(submitRow);
        }
    }
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
        const categoryId = getGameCategoryId(ticketData.game!, ticketData.type);

        if (!categoryId) {
            throw new Error(`${ticketData.type === 'paid' ? 'Paid' : 'Regular'} tickets category ID for ${getGameDisplayName(ticketData.game!)} not configured`);
        }

        const permissionOverwrites = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel],
                allow: [PermissionFlagsBits.UseApplicationCommands],
            },
            {
                id: userId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.UseApplicationCommands
                ],
            }
        ];

        const gameHelperRoleId = getGameHelperRoleId(ticketData.game!);
        if (gameHelperRoleId) {
            permissionOverwrites.push({
                id: gameHelperRoleId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.UseApplicationCommands
                ],
            });
        }

        if (ticketData.type === 'paid' && ticketData.selectedHelper) {
            permissionOverwrites.push({
                id: ticketData.selectedHelper,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageMessages,
                    PermissionFlagsBits.UseApplicationCommands
                ],
            });
        }

        // Create temporary channel first
        const tempChannelName = `${ticketData.type}-${ticketData.game}-temp-${Date.now()}`;
        const ticketChannel = await guild.channels.create({
            name: tempChannelName,
            type: ChannelType.GuildText,
            parent: categoryId,
            permissionOverwrites,
        });

        let ticketNumber: number;

        try {
            // Create ticket with atomic number generation
            const ticketResult = await db.createTicketWithAutoNumber({
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

            // Rename channel with actual ticket number
            const finalChannelName = `${ticketData.type}-${ticketData.game}-${ticketResult.ticketNumber}`;
            await ticketChannel.setName(finalChannelName);

            await botLogger.logTicketCreated(ticketResult.ticketNumber, userId, ticketData.type, ticketData.game!);

            ticketNumber = parseInt(ticketResult.ticketNumber);

        } catch (ticketError) {
            // If ticket creation fails, clean up the channel
            console.error('Error during atomic ticket creation, cleaning up channel:', ticketError);
            try {
                await ticketChannel.delete('Failed to create ticket record');
            } catch (cleanupError) {
                console.error('Error cleaning up channel after failed ticket creation:', cleanupError);
            }
            throw ticketError;
        }

        const components = [];

        // Create main ticket container using Components V2
        const mainContainer = new ContainerBuilder();
        if (!(mainContainer as any).components) {
            (mainContainer as any).components = [];
        }

        // Header
        const typeLabel = ticketData.type === 'paid' ? 'Paid Help Ticket' : 'Regular Help Ticket';
        const statusText = ticketData.type === 'paid' && ticketData.selectedHelper ? '\n**Status:** Assigned' : '';
        const headerText = new TextDisplayBuilder()
            .setContent(`# 🎫 Ticket Created\n\n<@${userId}> - Your ticket has been created!\n\n**Type:** ${typeLabel}${statusText}`);
        (mainContainer as any).components.push(headerText);
        (mainContainer as any).components.push(new SeparatorBuilder());

        // Request details
        const gameSection = new TextDisplayBuilder()
            .setContent(`**:video_game: Gamemode:** \`\`\`${capitalizeFirstLetter(ticketData.gamemode!)}\`\`\` `);
        (mainContainer as any).components.push(gameSection);

        const goalSection = new TextDisplayBuilder()
            .setContent(`**:dart: Goal:** \`\`\`${ticketData.goal!}\`\`\``);
        (mainContainer as any).components.push(goalSection);

        const linksSection = new TextDisplayBuilder()
            .setContent(`**:link: Communication:** \`\`\`${ticketData.canJoinLinks ? 'Can join links' : 'Cannot join links'}\`\`\` `);
        (mainContainer as any).components.push(linksSection);

        if (ticketData.robloxUsername) {
            const robloxSection = new TextDisplayBuilder()
                .setContent(`**ROBLOX Username:** \`\`\`${ticketData.robloxUsername}\`\`\``);
            (mainContainer as any).components.push(robloxSection);
        }

        if (ticketData.selectedHelper) {
            const helperSection = new TextDisplayBuilder()
                .setContent(`**Selected Helper:** \`\`\`<@${ticketData.selectedHelper}>\`\`\` `);
            (mainContainer as any).components.push(helperSection);
        }

        // Add separator before buttons
        (mainContainer as any).components.push(new SeparatorBuilder());

        // Create action buttons
        let buttons;
        if (ticketData.type === 'paid' && ticketData.selectedHelper) {
            buttons = new ActionRowBuilder<ButtonBuilder>().addComponents([
                new ButtonBuilder()
                    .setCustomId(`ring_helper_${ticketNumber}`)
                    .setLabel('Ring Helper')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📞'),
                new ButtonBuilder()
                    .setCustomId(`unclaim_ticket_${ticketNumber}`)
                    .setLabel('Unclaim')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🎫'),
                new ButtonBuilder()
                    .setCustomId(`close_ticket_${ticketNumber}`)
                    .setLabel('Close')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
            ]);
        } else {
            buttons = new ActionRowBuilder<ButtonBuilder>().addComponents([
                new ButtonBuilder()
                    .setCustomId(`claim_ticket_${ticketNumber}`)
                    .setLabel('Claim')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎫'),
                new ButtonBuilder()
                    .setCustomId(`ring_helper_${ticketNumber}`)
                    .setLabel('Ring Helper')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📞'),
                new ButtonBuilder()
                    .setCustomId(`close_ticket_${ticketNumber}`)
                    .setLabel('Close')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
            ]);
        }

        // Add the main container to components
        components.push(mainContainer);

        // Add buttons as separate component (outside container for Components V2 compatibility)
        if (buttons && buttons.components && Array.isArray(buttons.components) && buttons.components.length > 0) {
            components.push(buttons);
        }

        await ticketChannel.send({
            components,
            flags: MessageFlags.IsComponentsV2
        });

        if (ticketData.type === 'paid' && ticketData.selectedHelper) {
            await ticketChannel.send(`<@${ticketData.selectedHelper}> - You have been selected for this paid help request! This ticket has been automatically assigned to you.`);
        } else {
            const gameHelperRoleId = getGameHelperRoleId(ticketData.game!);
            if (gameHelperRoleId) {
                const pingMessage = await ticketChannel.send(`<@&${gameHelperRoleId}> New ${ticketData.type} ${getGameDisplayName(ticketData.game!)} carry ticket has been created`);
                await pingMessage.delete();
            } else {
                const helperRoleId = ticketData.type === 'paid' ? process.env.PAID_HELPER_ROLE_ID : process.env.HELPER_ROLE_ID;
                if (helperRoleId) {
                    const pingMessage = await ticketChannel.send(`<@&${helperRoleId}> New ${ticketData.type} carry ticket has been created`);
                    await pingMessage.delete();
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
        .setCustomId(`request_carry_goal_modal_${userId}`)
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

export function createRobloxUsernameModal(userId: string): ModalBuilder {
    const modal = new ModalBuilder()
        .setCustomId(`request_carry_roblox_modal_${userId}`)
        .setTitle('Add Helper Information');

    const usernameInput = new TextInputBuilder()
        .setCustomId('robloxUsername')
        .setLabel('Your ROBLOX Username')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter your ROBLOX username...')
        .setMinLength(3)
        .setMaxLength(20)
        .setRequired(true);

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(usernameInput);
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
            await safeReply(interaction, { content: errorMessage, flags: MessageFlags.Ephemeral });
        }
    } catch (followUpError) {
        console.error("Failed to send ticket error message:", followUpError);
    }
}

export default { data, execute };
export { VouchTicketData, showTicketForm, showTicketFormWithUpdate, createVouchTicketDisplay, createVouchTicketComponents };