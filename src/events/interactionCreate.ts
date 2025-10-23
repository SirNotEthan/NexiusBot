import { Client, ChatInputCommandInteraction, SlashCommandBuilder, ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { FREE_CARRIES_CONFIG, getGameDisplayName } from '../config/freeCarriesConfig';
import type { Interaction } from 'discord.js';
import { botLogger } from '../utils/logger';
import { isInteractionValid } from '../utils/interactionUtils';

import {
    handleTicketButtons,
    handleClaimTicket,
    handleEditTicket,
    handleCloseTicket,
    handleRingHelper,
    handleUnclaimTicket,
    handleLeaderboardButtons,
    handleTrackerRefreshButton,
    handleReviewButtons
} from '../interactions/buttons';

import { handleMiddlemanButtons } from '../interactions/buttons/middlemanButtons';

import {
    handleVouchGamemodeSelection,
    handlePaidHelperSelection,
    handleVouchRatingSelection
} from '../interactions/selectMenus';

import {
    handleTicketModals,
    handleEditTicketModal,
    handleVouchGoalModal,
    handleVouchReasonModal,
    handlePaidBioModal,
    handleReviewModal
} from '../interactions/modals';

import { handleMiddlemanModals } from '../interactions/modals/middlemanModals';

export interface Command {
    data: SlashCommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const name = 'interactionCreate';
export const once = false;

function getCustomId(interaction: any): string {
    if ('customId' in interaction) {
        return interaction.customId;
    }
    if ('commandName' in interaction) {
        return interaction.commandName;
    }
    return 'unknown';
}

function getInteractionTypeName(interaction: any): string {
    if (interaction.isButton && interaction.isButton()) return 'Button';
    if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) return 'SelectMenu';
    if (interaction.isModalSubmit && interaction.isModalSubmit()) return 'Modal';
    if (interaction.isChatInputCommand && interaction.isChatInputCommand()) return 'Command';
    return 'Unknown';
}

export async function execute(interaction: Interaction): Promise<void> {
    const client = interaction.client as Client;

    if (!isInteractionValid(interaction)) {
        if (interaction.isRepliable()) {
            const age = Date.now() - interaction.createdTimestamp;
            await botLogger.logInteractionTimeout(
                getInteractionTypeName(interaction),
                getCustomId(interaction),
                interaction.user.id,
                age,
                interaction.guildId || undefined,
                interaction.channelId
            );
        }
        return;
    }

    try {
        if (interaction.isChatInputCommand()) {
            await handleChatInputCommand(interaction, client);
        } else if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
        } else if (interaction.isStringSelectMenu()) {
            await handleSelectMenuInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModalInteraction(interaction);
        }
    } catch (error: any) {
        await botLogger.logInteractionFailure(
            getInteractionTypeName(interaction as any),
            getCustomId(interaction as any),
            interaction.user.id,
            error,
            interaction.guildId || undefined,
            interaction.channelId,
            `Interaction handler crashed: ${error.message}`
        );
    }
}

async function handleChatInputCommand(
    interaction: ChatInputCommandInteraction,
    client: Client
): Promise<void> {
    const { commands } = client as any;

    if (!commands?.has(interaction.commandName)) {
        console.warn(`Unknown command: ${interaction.commandName}`);
        return sendErrorResponse(
            interaction,
            `Command \`${interaction.commandName}\` not found.`,
            `Unknown command: ${interaction.commandName}`,
            'command_not_found'
        );
    }

    const command = commands.get(interaction.commandName)!;

    try {
        console.log(`Running /${interaction.commandName} by ${interaction.user.tag}`);
        const start = Date.now();
        await command.execute(interaction);
        const ms = Date.now() - start;
        console.log(`${interaction.commandName} executed in ${ms}ms`);
        
        await botLogger.logCommand(
            interaction.commandName,
            interaction.user.id,
            interaction.guildId || undefined,
            interaction.channelId || undefined,
            interaction.options.data.length > 0 ? JSON.stringify(interaction.options.data) : undefined,
            ms
        );
    } catch (err) {
        console.error(`Error executing command ${interaction.commandName}:`, err);
        
        await botLogger.error(
            'Command Execution Failed',
            `Failed to execute command: /${interaction.commandName}`,
            err as Error,
            {
                userId: interaction.user.id,
                guildId: interaction.guildId || undefined,
                channelId: interaction.channelId || undefined,
                commandName: interaction.commandName
            }
        );
        
        return sendErrorResponse(
            interaction,
            'There was an error while executing this command!',
            `Command execution failed: ${interaction.commandName}`,
            'execution_error'
        );
    }
}

async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    console.log(`Button interaction: ${interaction.customId} by ${interaction.user.tag}`);
    
    await botLogger.logInteraction(
        'Button',
        interaction.customId,
        interaction.user.id,
        interaction.guildId || undefined,
        interaction.channelId || undefined
    );
    
    if (interaction.customId === 'carry_request_embed_button') {
        await handleCarryRequestEmbedButton(interaction);
        return;
    }

    if (interaction.customId === 'carry_request_embed_v2' || interaction.customId === 'command_v2_carry_request') {
        const { InteractionRouter } = await import('../interactions/InteractionRouter');
        await InteractionRouter.routeButtonInteraction(interaction);
        return;
    }

    if (interaction.customId.startsWith('request_carry_') ||
        interaction.customId.startsWith('ticket_') ||
        interaction.customId === 'claim_ticket' ||
        interaction.customId === 'edit_ticket' ||
        interaction.customId === 'close_ticket' ||
        interaction.customId === 'unclaim_ticket' ||
        interaction.customId === 'ring_helper' ||
        interaction.customId.startsWith('authorize_close_') ||
        interaction.customId.startsWith('deny_close_')) {
        const { InteractionRouter } = await import('../interactions/InteractionRouter');
        await InteractionRouter.routeButtonInteraction(interaction);
        return;
    }
    
    if (interaction.customId.startsWith('leaderboard_')) {
        await handleLeaderboardButtons(interaction);
    }
    
    if (interaction.customId.startsWith('refresh_tracker_')) {
        await handleTrackerRefreshButton(interaction);
        return;
    }
    
    if (interaction.customId === 'claim_ticket' || interaction.customId.startsWith('claim_ticket_')) {
        await handleClaimTicket(interaction);
    }
    
    if (interaction.customId === 'edit_ticket') {
        await handleEditTicket(interaction);
    }
    
    if (interaction.customId === 'close_ticket' || interaction.customId.startsWith('close_ticket_')) {
        await handleCloseTicket(interaction);
    }
    
    if (interaction.customId === 'ring_helper' || interaction.customId.startsWith('ring_helper_')) {
        await handleRingHelper(interaction);
    }
    
    if (interaction.customId === 'unclaim_ticket' || interaction.customId.startsWith('unclaim_ticket_')) {
        await handleUnclaimTicket(interaction);
    }
    
    if ((interaction.customId.startsWith('review_') || interaction.customId.startsWith('close_review_')) && !interaction.customId.includes('modal')) {
        await handleReviewButtons(interaction);
    }
    
    if (interaction.customId.startsWith('middleman_')) {
        await handleMiddlemanButtons(interaction);
    }
}

async function handleSelectMenuInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
    console.log(`Select menu interaction: ${interaction.customId} by ${interaction.user.tag}`);
    
    await botLogger.logInteraction(
        'Select Menu',
        interaction.customId,
        interaction.user.id,
        interaction.guildId || undefined,
        interaction.channelId || undefined
    );
    
    if (interaction.customId.startsWith('embed_ticket_type_')) {
        await handleEmbedTicketTypeSelection(interaction);
        return;
    }
    
    if (interaction.customId.startsWith('embed_game_select_')) {
        await handleEmbedGameSelection(interaction);
        return;
    }
    
    if (interaction.customId === 'service_info_game_select') {
        await handleServiceInfoGameSelection(interaction);
        return;
    }
    
    if (interaction.customId.startsWith('carry_request_game_select_') ||
        interaction.customId.startsWith('carry_request_embed_game_select_') ||
        interaction.customId.startsWith('command_v2_game_select_')) {
        const { InteractionRouter } = await import('../interactions/InteractionRouter');
        await InteractionRouter.routeSelectMenuInteraction(interaction);
        return;
    }

    if (interaction.customId.startsWith('request_carry_gamemode_')) {
        const { InteractionRouter } = await import('../interactions/InteractionRouter');
        await InteractionRouter.routeSelectMenuInteraction(interaction);
        return;
    }

    if (interaction.customId.startsWith('vouch_ticket_select_') ||
        interaction.customId.startsWith('vouch_rating_') ||
        interaction.customId.startsWith('vouch_gamemode_') ||
        interaction.customId.startsWith('paid_helper_select_')) {
        const { InteractionRouter } = await import('../interactions/InteractionRouter');
        await InteractionRouter.routeSelectMenuInteraction(interaction);
        return;
    }
}

async function handleModalInteraction(interaction: ModalSubmitInteraction): Promise<void> {
    console.log(`Modal interaction: ${interaction.customId} by ${interaction.user.tag}`);
    
    await botLogger.logInteraction(
        'Modal',
        interaction.customId,
        interaction.user.id,
        interaction.guildId || undefined,
        interaction.channelId || undefined
    );
    
    if (interaction.customId.startsWith('ticket_') && interaction.customId.endsWith('_modal')) {
        await handleTicketModals(interaction);
    }
    
    if (interaction.customId.includes('request_carry_') && interaction.customId.includes('_modal_')) {
        const { InteractionRouter } = await import('../interactions/InteractionRouter');
        await InteractionRouter.routeModalInteraction(interaction);
        return;
    }

    if (interaction.customId.startsWith('vouch_goal_modal_') ||
        interaction.customId.startsWith('vouch_reason_modal_') ||
        interaction.customId.startsWith('paid_bio_modal_')) {
        const { InteractionRouter } = await import('../interactions/InteractionRouter');
        await InteractionRouter.routeModalInteraction(interaction);
        return;
    }
    
    if (interaction.customId === 'edit_ticket_modal') {
        await handleEditTicketModal(interaction);
    }
    
    if (interaction.customId.startsWith('review_modal_') || interaction.customId.startsWith('close_review_modal_')) {
        await handleReviewModal(interaction);
    }
    
    if (interaction.customId.includes('middleman_')) {
        await handleMiddlemanModals(interaction);
    }
}

async function handleEmbedTicketTypeSelection(interaction: StringSelectMenuInteraction): Promise<void> {
    try {
        const userId = interaction.customId.split('_').pop();
        if (interaction.user.id !== userId) {
            await interaction.reply({ content: "❌ This selection is not for you!", ephemeral: true });
            return;
        }

        const ticketType = interaction.values[0] as 'regular' | 'paid';
        
        const embed = new EmbedBuilder()
            .setTitle(`🎮 Request Carry - Select Game`)
            .setDescription(`**Selected:** ${ticketType === 'paid' ? '💳 Paid Help' : '🎫 Regular Help'}\n\nNow choose which game you need help with:`)
            .setColor(ticketType === 'paid' ? 0xffa500 : 0x5865f2)
            .addFields([
                {
                    name: '🎲 Available Games',
                    value: '• **Anime Last Stand** - 📚 Story, ♾️ Infinite, ⚔️ Raids, 🏆 Challenges, 🎤 Portals, 🪨 Cavens, 👑 Legend Stages, 💀 Dungeons, 🩹 Survival\n• **Anime Vanguards** - 📖 Story, 👑 Infinite, 🏆 Challenges, 🌟 Legend, 🔥 Raid dungeons, 🌀 Portal, 🐉 Boss Raids, 🌠 Rifts',
                    inline: false
                }
            ])
            .setFooter({ text: 'Choose your game to proceed to the ticket form!' });

        const gameSelect = new StringSelectMenuBuilder()
            .setCustomId(`embed_game_select_${ticketType}_${interaction.user.id}`)
            .setPlaceholder('Choose your game...')
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel('Anime Last Stand')
                    .setDescription('ALS - Tower Defense Game')
                    .setValue('als')
                    .setEmoji('🏰'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Anime Vanguards')
                    .setDescription('AV - Action Strategy Game')
                    .setValue('av')
                    .setEmoji('⚔️')
            ]);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gameSelect);

        await interaction.update({
            embeds: [embed],
            components: [row]
        });
    } catch (error) {
        console.error('Error handling embed ticket type selection:', error);
        await interaction.reply({
            content: "❌ Failed to process your selection. Please try again.",
            ephemeral: true
        });
    }
}

async function handleEmbedGameSelection(interaction: StringSelectMenuInteraction): Promise<void> {
    try {
        await interaction.update({
            content: "🔄 **This feature is being updated!**\n\nPlease use `/request-carry` command for the new improved experience.",
            components: [],
            embeds: []
        });
    } catch (error) {
        console.error('Error handling embed game selection:', error);
        await interaction.reply({
            content: "❌ Failed to process your game selection. Please try again.",
            ephemeral: true
        });
    }
}

async function handleCarryRequestEmbedButton(interaction: ButtonInteraction): Promise<void> {
    try {
        const embed = new EmbedBuilder()
            .setTitle('🎮 Request Carry - Select Type & Game')
            .setDescription('Choose your ticket type and game to get started with your carry request.')
            .setColor(0x5865f2)
            .addFields([
                {
                    name: '📋 Ticket Types',
                    value: '• **Regular Help** - Free assistance (5 runs per gamemode per day)\n• **Paid Help** - Premium service with dedicated helpers',
                    inline: false
                },
                {
                    name: '🎲 Supported Games',
                    value: '• **Anime Last Stand** (ALS)\n• **Anime Vanguards** (AV)',
                    inline: false
                }
            ])
            .setFooter({ text: 'Select your ticket type first, then choose your game!' });

        const ticketTypeSelect = new StringSelectMenuBuilder()
            .setCustomId(`embed_ticket_type_${interaction.user.id}`)
            .setPlaceholder('Choose ticket type...')
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel('Regular Help')
                    .setDescription('Free assistance - 5 runs per gamemode per day')
                    .setValue('regular')
                    .setEmoji('🎫'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Paid Help')
                    .setDescription('Premium service with dedicated helpers')
                    .setValue('paid')
                    .setEmoji('💳')
            ]);

        const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(ticketTypeSelect);

        await interaction.reply({
            embeds: [embed],
            components: [row1],
            ephemeral: true
        });
    } catch (error) {
        console.error('Error handling carry request embed button:', error);
        await interaction.reply({
            content: "❌ Failed to process your request. Please try again later.",
            ephemeral: true
        });
    }
}

async function sendErrorResponse(
    interaction: ChatInputCommandInteraction,
    userMessage: string,
    logMessage: string,
    errorType: string
): Promise<void> {
    console.error(logMessage);

    try {
        const response = { content: userMessage, ephemeral: true };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(response);
        } else {
            await interaction.reply(response);
        }
    } catch (error) {
        console.error('Failed to send error response:', error);
    }
}

async function handleServiceInfoGameSelection(interaction: StringSelectMenuInteraction): Promise<void> {
    try {
        const selectedGame = interaction.values[0];
        const gameConfig = FREE_CARRIES_CONFIG[selectedGame];
        
        if (!gameConfig) {
            await interaction.reply({
                content: "❌ Invalid game selection. Please try again.",
                ephemeral: true
            });
            return;
        }

        const gameName = getGameDisplayName(selectedGame);
        const gameEmoji = selectedGame === 'als' ? '⚔️' : '🛡️';
        
        const limitEntries = Object.entries(gameConfig.gameLimits).map(([gamemode, limit]) => {
            const formattedGamemode = gamemode.split('-').map(word => 
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
            return `• **${formattedGamemode}:** ${limit} carries/day`;
        });

        const embed = new EmbedBuilder()
            .setTitle(`${gameEmoji} ${gameName} - Free Carry Limits`)
            .setDescription(`**Daily free carry limits for ${gameName}**\n\nThese limits reset every day at midnight UTC. You must have at least 50 messages in the server today to be eligible.`)
            .setColor(selectedGame === 'als' ? 0xff6b6b : 0x5865f2)
            .addFields([
                {
                    name: '📊 **Carry Limits per Gamemode**',
                    value: limitEntries.join('\n'),
                    inline: false
                },
                {
                    name: '📋 **Requirements**',
                    value: '• At least 50 messages in the server today\n• One request per gamemode at a time\n• Respect helper availability',
                    inline: false
                },
                {
                    name: '💡 **Tips**',
                    value: '• Limits are per gamemode, not total\n• Use different gamemodes if one reaches limit\n• Consider Paid Help for unlimited requests',
                    inline: false
                }
            ])
            .setFooter({ 
                text: `Limits reset daily at midnight UTC • Use /request-carry to get started`,
                iconURL: interaction.client.user?.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error handling service info game selection:', error);
        await interaction.reply({
            content: "❌ An error occurred while fetching game information. Please try again.",
            ephemeral: true
        });
    }
}
