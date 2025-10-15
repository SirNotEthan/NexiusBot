import { 
    ButtonInteraction, 
    StringSelectMenuInteraction, 
    ModalSubmitInteraction,
    Interaction
} from 'discord.js';

// Import legacy handlers for Components V2 compatibility

// Import legacy handlers for backward compatibility
import {
    handleTicketButtons,
    handleVouchTicketButtons,
    handleClaimTicket,
    handleEditTicket,
    handleCloseTicket,
    handleRingHelper,
    handleUnclaimTicket,
    handleAuthorizeClose,
    handleDenyClose,
    handleLeaderboardButtons,
    handleTrackerRefreshButton,
    handleReviewButtons
} from './buttons';

import { handleMiddlemanButtons } from './buttons/middlemanButtons';

import {
    handleVouchGamemodeSelection,
    handlePaidHelperSelection,
    handleVouchRatingSelection
} from './selectMenus';

import {
    handleTicketModals,
    handleEditTicketModal,
    handleVouchGoalModal,
    handleVouchReasonModal,
    handlePaidBioModal,
    handleRobloxUsernameModal,
    handleReviewModal
} from './modals';

import { handleMiddlemanModals } from './modals/middlemanModals';

/**
 * Modern interaction router that handles both new modular commands
 * and legacy interactions for backward compatibility
 */
export class InteractionRouter {

    /**
     * Route button interactions to appropriate handlers
     */
    static async routeButtonInteraction(interaction: ButtonInteraction): Promise<void> {
        const customId = interaction.customId;

        console.log(`[ROUTER] Button interaction: ${customId}`);

        // Route to Components V2 handlers
        if (this.isRequestCarryButton(customId)) {
            console.log(`[ROUTER] Routing ${customId} to vouch ticket buttons (Components V2)`);
            await handleVouchTicketButtons(interaction);
            return;
        }

        console.log(`[ROUTER] Routing ${customId} to legacy handlers`);
        // Legacy button handling
        await this.handleLegacyButtons(interaction);
    }

    /**
     * Route select menu interactions to appropriate handlers
     */
    static async routeSelectMenuInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
        const customId = interaction.customId;

        // Route to Components V2 handlers
        if (this.isRequestCarrySelectMenu(customId)) {
            await handleVouchGamemodeSelection(interaction);
            return;
        }

        // Carry request embed game selection
        if (customId.startsWith('carry_request_game_select_') || customId.startsWith('carry_request_embed_game_select_')) {
            await this.handleCarryRequestGameSelection(interaction);
            return;
        }

        // Command V2 game selection
        if (customId.startsWith('command_v2_game_select_')) {
            await this.handleCommandV2GameSelection(interaction);
            return;
        }

        // Legacy select menu handling
        await this.handleLegacySelectMenus(interaction);
    }

    /**
     * Route modal interactions to appropriate handlers
     */
    static async routeModalInteraction(interaction: ModalSubmitInteraction): Promise<void> {
        const customId = interaction.customId;

        // Route to Components V2 handlers
        if (this.isRequestCarryModal(customId)) {
            if (customId.includes('goal_modal_')) {
                await handleVouchGoalModal(interaction);
            } else if (customId.includes('roblox_modal_')) {
                await handleRobloxUsernameModal(interaction);
            }
            return;
        }

        // Legacy modal handling
        await this.handleLegacyModals(interaction);
    }

    /**
     * Check if button belongs to request-carry command
     */
    private static isRequestCarryButton(customId: string): boolean {
        // Original request-carry form buttons
        if (customId.startsWith('request_carry_') &&
           (customId.includes('_goal_') ||
            customId.includes('_links_') ||
            customId.includes('_submit_') ||
            customId.includes('_cancel_') ||
            customId.includes('_helper_'))) {
            console.log(`[ROUTER] ${customId} is request-carry form button`);
            return true;
        }

        console.log(`[ROUTER] ${customId} is not a request-carry button`);
        return false;
    }

    /**
     * Check if select menu belongs to request-carry command
     */
    private static isRequestCarrySelectMenu(customId: string): boolean {
        return customId.startsWith('request_carry_') &&
               (customId.includes('_gamemode_') ||
                customId.includes('_game_') ||
                customId.includes('_helper_'));
    }

    /**
     * Check if modal belongs to request-carry command
     */
    private static isRequestCarryModal(customId: string): boolean {
        return customId.includes('request_carry_') && customId.includes('_modal_');
    }

    /**
     * Handle legacy button interactions
     */
    private static async handleLegacyButtons(interaction: ButtonInteraction): Promise<void> {
        const customId = interaction.customId;

        try {
            // Carry request embed button (legacy)
            if (customId === 'carry_request_embed_button') {
                await this.handleCarryRequestEmbedButton(interaction);
                return;
            }

            // Carry request embed button (Components V2)
            if (customId === 'carry_request_embed_v2') {
                await this.handleCarryRequestEmbedV2(interaction);
                return;
            }

            // Command V2 carry request button
            if (customId === 'command_v2_carry_request') {
                await this.handleCommandV2CarryRequest(interaction);
                return;
            }
            
            // New ticket control buttons (should be handled by RequestCarryButtonHandler)
            if (customId.startsWith('ticket_') && 
                (customId.includes('_claim_') || customId.includes('_unclaim_') || customId.includes('_close_'))) {
                // These are handled by the new RequestCarryButtonHandler above
                console.warn(`New ticket control button ${customId} should have been handled by RequestCarryButtonHandler`);
                return;
            }
            
            // Legacy ticket buttons
            if (customId.startsWith('ticket_')) {
                await handleTicketButtons(interaction);
                return;
            }
            
            // Vouch ticket buttons
            if (customId.startsWith('vouch_')) {
                await handleVouchTicketButtons(interaction);
                return;
            }
            
            // Leaderboard buttons
            if (customId.startsWith('leaderboard_')) {
                await handleLeaderboardButtons(interaction);
                return;
            }
            
            // Tracker refresh
            if (customId.startsWith('refresh_tracker_')) {
                await handleTrackerRefreshButton(interaction);
                return;
            }
            
            // Specific ticket actions
            if (customId === 'claim_ticket' || customId.startsWith('claim_ticket_')) {
                await handleClaimTicket(interaction);
                return;
            }
            
            if (customId === 'edit_ticket') {
                await handleEditTicket(interaction);
                return;
            }
            
            if (customId === 'close_ticket' || customId.startsWith('close_ticket_')) {
                await handleCloseTicket(interaction);
                return;
            }
            
            if (customId === 'ring_helper' || customId.startsWith('ring_helper_')) {
                await handleRingHelper(interaction);
                return;
            }
            
            if (customId === 'unclaim_ticket' || customId.startsWith('unclaim_ticket_')) {
                await handleUnclaimTicket(interaction);
                return;
            }

            // Authorization buttons
            if (customId.startsWith('authorize_close_')) {
                await handleAuthorizeClose(interaction);
                return;
            }

            if (customId.startsWith('deny_close_')) {
                await handleDenyClose(interaction);
                return;
            }

            // Review buttons
            if ((customId.startsWith('review_') || customId.startsWith('close_review_')) && !customId.includes('modal')) {
                await handleReviewButtons(interaction);
                return;
            }
            
            // Middleman buttons
            if (customId.startsWith('middleman_')) {
                await handleMiddlemanButtons(interaction);
                return;
            }

            console.warn(`Unhandled button interaction: ${customId}`);
        } catch (error) {
            console.error('Error in legacy button handler:', error);
        }
    }

    /**
     * Handle legacy select menu interactions
     */
    private static async handleLegacySelectMenus(interaction: StringSelectMenuInteraction): Promise<void> {
        const customId = interaction.customId;

        try {
            // Embed-based selections (legacy)
            if (customId.startsWith('embed_ticket_type_')) {
                await this.handleEmbedTicketTypeSelection(interaction);
                return;
            }
            
            if (customId.startsWith('embed_game_select_')) {
                await this.handleEmbedGameSelection(interaction);
                return;
            }
            
            if (customId === 'service_info_game_select') {
                await this.handleServiceInfoGameSelection(interaction);
                return;
            }
            
            // Vouch-related selections
            if (customId.startsWith('paid_helper_select_')) {
                await handlePaidHelperSelection(interaction);
                return;
            }
            
            if (customId.startsWith('vouch_gamemode_')) {
                await handleVouchGamemodeSelection(interaction);
                return;
            }
            
            if (customId.startsWith('vouch_rating_')) {
                await handleVouchRatingSelection(interaction);
                return;
            }

            console.warn(`Unhandled select menu interaction: ${customId}`);
        } catch (error) {
            console.error('Error in legacy select menu handler:', error);
        }
    }

    /**
     * Handle legacy modal interactions
     */
    private static async handleLegacyModals(interaction: ModalSubmitInteraction): Promise<void> {
        const customId = interaction.customId;

        try {
            // Ticket modals
            if (customId.startsWith('ticket_') && customId.endsWith('_modal')) {
                await handleTicketModals(interaction);
                return;
            }
            
            // Vouch modals
            if (customId.startsWith('vouch_goal_modal_')) {
                await handleVouchGoalModal(interaction);
                return;
            }
            
            if (customId.startsWith('vouch_reason_modal_')) {
                await handleVouchReasonModal(interaction);
                return;
            }
            
            if (customId.startsWith('paid_bio_modal_')) {
                await handlePaidBioModal(interaction);
                return;
            }
            
            if (customId === 'edit_ticket_modal') {
                await handleEditTicketModal(interaction);
                return;
            }
            
            // Review modals
            if (customId.startsWith('review_modal_') || customId.startsWith('close_review_modal_')) {
                await handleReviewModal(interaction);
                return;
            }
            
            // Middleman modals
            if (customId.includes('middleman_')) {
                await handleMiddlemanModals(interaction);
                return;
            }

            console.warn(`Unhandled modal interaction: ${customId}`);
        } catch (error) {
            console.error('Error in legacy modal handler:', error);
        }
    }

    /**
     * Legacy handler methods (simplified for compatibility)
     */
    private static async handleCarryRequestEmbedButton(interaction: ButtonInteraction): Promise<void> {
        // Legacy implementation - could be replaced with new modular approach
        await interaction.reply({
            content: "🔄 **This feature is being updated!**\n\nPlease use `/request-carry` command for the new improved experience.",
            ephemeral: true
        });
    }

    private static async handleCarryRequestEmbedV2(interaction: ButtonInteraction): Promise<void> {
        try {
            console.log('Handling carry request embed V2 button for user:', interaction.user.id);

            // First, reply immediately to prevent timeout
            await interaction.deferReply({ ephemeral: true });

            // Import necessary functions
            const { cooldownManager } = await import('../utils/cooldownManager.js');
            const { isInteractionValid } = await import('../utils/interactionUtils.js');
            const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } = await import('discord.js');

            // Check if interaction is valid
            if (!isInteractionValid(interaction)) {
                console.warn('Interaction expired, cannot process carry request');
                await interaction.editReply({
                    content: "❌ This interaction has expired. Please try again."
                });
                return;
            }

            // Check cooldown
            if (cooldownManager.isOnCooldown(interaction.user.id, 'carry_request')) {
                const remainingTime = cooldownManager.getRemainingCooldown(interaction.user.id, 'carry_request');
                const timeString = cooldownManager.formatRemainingTime(remainingTime);

                await interaction.editReply({
                    content: `⏰ **Please wait ${timeString}** before creating another carry request.\n\n*This prevents request spam and helps us manage the queue efficiently.*`
                });
                return;
            }

            // Create game selection menu
            const gameSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`carry_request_embed_game_select_${interaction.user.id}`)
                .setPlaceholder('Choose a game you need help in.')
                .addOptions([
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Anime Last Stand')
                        .setDescription('Request a regular help ticket for ALS')
                        .setValue('als')
                        .setEmoji('⚔️'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Anime Vanguard')
                        .setDescription('Request a regular help ticket for AV')
                        .setValue('av')
                        .setEmoji('🛡️')
                ]);

            const row = new (ActionRowBuilder as any)().addComponents(gameSelectMenu);

            await interaction.editReply({
                content: "🎫 **Create A Regular Help Request Ticket**",
                components: [row]
            });

            console.log('Successfully handled carry request embed V2 button');

        } catch (error) {
            console.error("Error in carry request embed V2:", error);

            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({
                        content: "❌ Failed to create carry request form. Please try again later."
                    });
                } else {
                    await interaction.reply({
                        content: "❌ Failed to create carry request form. Please try again later.",
                        ephemeral: true
                    });
                }
            } catch (followUpError) {
                console.error("Failed to send error response:", followUpError);
            }
        }
    }

    private static async handleCommandV2CarryRequest(interaction: ButtonInteraction): Promise<void> {
        try {
            const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } = await import('discord.js');

            // Create game selection menu for Command V2
            const gameSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`command_v2_game_select_${interaction.user.id}`)
                .setPlaceholder('🎮 What game do you need help with?')
                .addOptions([
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Anime Last Stand')
                        .setDescription('Request carry for ALS')
                        .setValue('als')
                        .setEmoji('⚔️'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Anime Vanguard')
                        .setDescription('Request carry for AV')
                        .setValue('av')
                        .setEmoji('🛡️')
                ]);

            const row = new (ActionRowBuilder as any)().addComponents(gameSelectMenu);

            await interaction.reply({
                content: "**Command V2** - Select the game you need help with:",
                components: [row],
                ephemeral: true
            });
        } catch (error) {
            console.error("Error in Command V2 carry request:", error);
            await interaction.reply({
                content: "❌ Failed to create carry request form. Please try again later.",
                ephemeral: true
            });
        }
    }

    private static async handleCommandV2GameSelection(interaction: StringSelectMenuInteraction): Promise<void> {
        try {
            const selectedGame = interaction.values[0];

            // Import necessary functions and types
            const { showTicketForm } = await import('../commands/vouch/request-carry.js');
            const { cooldownManager } = await import('../utils/cooldownManager.js');
            const { isInteractionValid, safeDeferReply } = await import('../utils/interactionUtils.js');

            // Check if interaction is valid
            if (!isInteractionValid(interaction)) {
                console.warn('Interaction expired, cannot process Command V2 carry request');
                return;
            }

            // Check cooldown
            if (cooldownManager.isOnCooldown(interaction.user.id, 'carry_request')) {
                const remainingTime = cooldownManager.getRemainingCooldown(interaction.user.id, 'carry_request');
                const timeString = cooldownManager.formatRemainingTime(remainingTime);

                await interaction.reply({
                    content: `⏰ **Please wait ${timeString}** before creating another carry request.\n\n*This prevents request spam and helps us manage the queue efficiently.*`,
                    ephemeral: true
                });
                return;
            }

            // Defer the reply
            const deferred = await safeDeferReply(interaction, { ephemeral: true });
            if (!deferred) return;

            // Create ticket data with selected game
            const ticketData = {
                type: 'regular' as const,
                game: selectedGame
            };

            // Use the existing showTicketForm logic
            await showTicketForm(interaction, ticketData);

        } catch (error) {
            console.error("Error in Command V2 game selection:", error);

            const errorMessage = "❌ Failed to create carry request form. Please try again later.";

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }

    private static async handleCarryRequestGameSelection(interaction: StringSelectMenuInteraction): Promise<void> {
        try {
            const selectedGame = interaction.values[0];

            // Import necessary functions - use exact same imports as request carry command
            const { showTicketFormWithUpdate } = await import('../commands/vouch/request-carry.js');
            const { cooldownManager } = await import('../utils/cooldownManager.js');
            const { isInteractionValid } = await import('../utils/interactionUtils.js');

            // Use exact same validation logic as request carry command
            if (!isInteractionValid(interaction)) {
                console.warn('Interaction expired, cannot process carry request');
                return;
            }

            // Use exact same cooldown logic as request carry command
            if (cooldownManager.isOnCooldown(interaction.user.id, 'carry_request')) {
                const remainingTime = cooldownManager.getRemainingCooldown(interaction.user.id, 'carry_request');
                const timeString = cooldownManager.formatRemainingTime(remainingTime);

                await interaction.update({
                    content: `⏰ **Please wait ${timeString}** before creating another carry request.\n\n*This prevents request spam and helps us manage the queue efficiently.*`,
                    components: []
                });
                return;
            }

            // Since paid is disabled in slash command, we use regular (same logic)
            const ticketType = 'regular' as const;

            // Create ticket data exactly like the slash command does
            const ticketData = {
                type: ticketType,
                game: selectedGame
            };

            // Use showTicketForm with update mode
            await showTicketFormWithUpdate(interaction, ticketData);

        } catch (error) {
            console.error("Error in carry request game selection:", error);

            // Use update to keep in same message
            const errorMessage = "❌ Failed to create carry request form. Please try again later.";

            try {
                await interaction.update({
                    content: errorMessage,
                    components: []
                });
            } catch (updateError) {
                console.error("Failed to update with error message:", updateError);
            }
        }
    }

    private static async handleEmbedTicketTypeSelection(interaction: StringSelectMenuInteraction): Promise<void> {
        // Legacy implementation placeholder
        await interaction.reply({
            content: "🔄 **This feature is being updated!**\n\nPlease use `/request-carry` command for the new improved experience.",
            ephemeral: true
        });
    }

    private static async handleEmbedGameSelection(interaction: StringSelectMenuInteraction): Promise<void> {
        // Legacy implementation placeholder
        await interaction.reply({
            content: "🔄 **This feature is being updated!**\n\nPlease use `/request-carry` command for the new improved experience.",
            ephemeral: true
        });
    }

    private static async handleServiceInfoGameSelection(interaction: StringSelectMenuInteraction): Promise<void> {
        // Legacy implementation placeholder
        await interaction.reply({
            content: "Service information feature is being updated. Please check back later.",
            ephemeral: true
        });
    }
}