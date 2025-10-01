import { StringSelectMenuInteraction, MessageFlags } from 'discord.js';
import { RequestCarryData, RequestCarryBuilder } from '../builders/RequestCarryBuilder';
import { RequestCarryButtonHandler } from './ButtonHandler';
import { isInteractionValid, safeUpdate } from '../../../../utils/interactionUtils';

/**
 * Handles select menu interactions for the request-carry command
 * Manages dropdown selections for games, gamemodes, and other options
 */
export class RequestCarrySelectMenuHandler {
    
    /**
     * Main entry point for handling select menu interactions
     */
    static async handle(interaction: StringSelectMenuInteraction): Promise<void> {
        if (!isInteractionValid(interaction)) {
            console.warn('Select menu interaction expired, cannot process');
            return;
        }

        const customId = interaction.customId;
        const userId = this.extractUserIdFromCustomId(customId);

        // Verify the interaction is for the correct user
        if (userId !== interaction.user.id) {
            await interaction.reply({
                content: "This selection is not for you!",
                ephemeral: true
            });
            return;
        }

        try {
            if (customId.includes('_gamemode_')) {
                await this.handleGamemodeSelection(interaction, userId);
            } else if (customId.includes('_game_')) {
                await this.handleGameSelection(interaction, userId);
            } else if (customId.includes('_helper_')) {
                await this.handleHelperSelection(interaction, userId);
            }
        } catch (error) {
            console.error('Error handling request carry select menu:', error);
            await this.handleError(interaction, error);
        }
    }

    /**
     * Handle gamemode selection
     */
    private static async handleGamemodeSelection(interaction: StringSelectMenuInteraction, userId: string): Promise<void> {
        const selectedGamemode = interaction.values[0];
        
        if (!selectedGamemode) {
            await interaction.reply({
                content: "Invalid gamemode selection. Please try again.",
                ephemeral: true
            });
            return;
        }

        // Sync with current state first
        await this.syncWithCurrentState(interaction, userId);

        // Validate gamemode for the selected game
        const data = RequestCarryButtonHandler.getSessionData(userId);
        if (!data.game || !this.isValidGamemode(data.game, selectedGamemode)) {
            await interaction.reply({
                content: "Invalid gamemode for the selected game. Please try again.",
                ephemeral: true
            });
            return;
        }

        try {
            // Update session data
            data.gamemode = selectedGamemode;
            RequestCarryButtonHandler.setSessionData(userId, data);

            // Update the interface
            await this.updateInterface(interaction, userId, data);

        } catch (error) {
            console.error('Error updating gamemode:', error);
            await interaction.reply({
                content: "Failed to update gamemode. Please try again.",
                ephemeral: true
            });
        }
    }

    /**
     * Handle game selection (for initial setup)
     */
    private static async handleGameSelection(interaction: StringSelectMenuInteraction, userId: string): Promise<void> {
        const selectedGame = interaction.values[0];
        
        if (!selectedGame || !this.isValidGame(selectedGame)) {
            await interaction.reply({
                content: "Invalid game selection. Please try again.",
                ephemeral: true
            });
            return;
        }

        try {
            // Update session data
            const data = RequestCarryButtonHandler.getSessionData(userId);
            data.game = selectedGame;
            // Reset gamemode when game changes
            data.gamemode = undefined;
            RequestCarryButtonHandler.setSessionData(userId, data);

            // Update the interface
            await this.updateInterface(interaction, userId, data);

        } catch (error) {
            console.error('Error updating game:', error);
            await interaction.reply({
                content: "Failed to update game selection. Please try again.",
                ephemeral: true
            });
        }
    }

    /**
     * Handle helper selection (for paid carries)
     */
    private static async handleHelperSelection(interaction: StringSelectMenuInteraction, userId: string): Promise<void> {
        const selectedHelper = interaction.values[0];
        
        if (!selectedHelper) {
            await interaction.reply({
                content: "Invalid helper selection. Please try again.",
                ephemeral: true
            });
            return;
        }

        try {
            // Verify helper is still available
            const isAvailable = await this.verifyHelperAvailability(selectedHelper);
            if (!isAvailable) {
                await interaction.reply({
                    content: "Selected helper is no longer available. Please choose another helper.",
                    ephemeral: true
                });
                return;
            }

            // Update session data
            const data = RequestCarryButtonHandler.getSessionData(userId);
            data.selectedHelper = selectedHelper;
            RequestCarryButtonHandler.setSessionData(userId, data);

            // Update the interface
            await this.updateInterface(interaction, userId, data);

        } catch (error) {
            console.error('Error updating helper selection:', error);
            await interaction.reply({
                content: "Failed to update helper selection. Please try again.",
                ephemeral: true
            });
        }
    }

    /**
     * Update the interface with new data
     */
    private static async updateInterface(interaction: StringSelectMenuInteraction, userId: string, data: RequestCarryData): Promise<void> {
        // Use compatible system for now
        const { createVouchTicketComponents } = await import('../../request-carry');
        const ticketData = {
            type: data.type,
            game: data.game,
            gamemode: data.gamemode,
            goal: data.goal,
            canJoinLinks: data.canJoinLinks,
            selectedHelper: data.selectedHelper
        };
        
        const components = createVouchTicketComponents(ticketData, userId);

        // Always update the original message, never create a reply
        await safeUpdate(interaction, {
            components: components,
            flags: MessageFlags.IsComponentsV2
        });
    }

    /**
     * Validation methods
     */
    private static isValidGame(game: string): boolean {
        const validGames = ['als', 'av'];
        return validGames.includes(game);
    }

    private static isValidGamemode(game: string, gamemode: string): boolean {
        const validGamemodes: Record<string, string[]> = {
            'av': [
                'story', 'legend-stages', 'rift', 'inf', 'raids', 
                'sjw-dungeon', 'dungeons', 'portals', 'void', 'towers', 'events'
            ],
            'als': [
                'story', 'legend-stages', 'raids', 'dungeons', 
                'survival', 'breach', 'portals'
            ]
        };

        return validGamemodes[game]?.includes(gamemode) || false;
    }

    private static async verifyHelperAvailability(helperId: string): Promise<boolean> {
        // TODO: Implement helper availability check
        // This would check if the helper is still active and available
        // For now, return true as a placeholder
        return true;
    }

    /**
     * Extract user ID from custom ID
     */
    private static extractUserIdFromCustomId(customId: string): string {
        const parts = customId.split('_');
        // Find the user ID part (typically after the action part)
        for (let i = 0; i < parts.length; i++) {
            if (parts[i].match(/^\d{17,19}$/)) { // Discord user ID pattern
                return parts[i];
            }
        }
        return '';
    }

    /**
     * Sync session data with current message state
     */
    private static async syncWithCurrentState(interaction: StringSelectMenuInteraction, userId: string): Promise<void> {
        try {
            const currentData = RequestCarryButtonHandler.getSessionData(userId);
            
            // Parse current state from message components
            const fullContent = JSON.stringify(interaction.message?.components || {});
            
            // Parse game from display text
            if (fullContent.includes('Anime Last Stand') && !currentData.game) {
                currentData.game = 'als';
            } else if (fullContent.includes('Anime Vanguard') && !currentData.game) {
                currentData.game = 'av';
            }
            
            // Try to parse existing goal
            if (!currentData.goal) {
                const goalMatch = fullContent.match(/Goal Description.*?\[SET\].*?"([^"]+)"/);
                if (goalMatch && goalMatch[1]) {
                    currentData.goal = goalMatch[1];
                }
            }
            
            // Try to parse canJoinLinks from display text
            if (currentData.canJoinLinks === undefined) {
                if (fullContent.includes('Yes - Can join Discord voice channels') || 
                    fullContent.includes('Can join Discord voice channels and links')) {
                    currentData.canJoinLinks = true;
                } else if (fullContent.includes('No - Cannot join Discord voice channels') || 
                           fullContent.includes('Cannot join Discord voice channels and links')) {
                    currentData.canJoinLinks = false;
                }
            }
            
            RequestCarryButtonHandler.setSessionData(userId, currentData);
        } catch (error) {
            console.warn('Error syncing session data with current state:', error);
        }
    }

    /**
     * Handle errors in select menu processing
     */
    private static async handleError(interaction: StringSelectMenuInteraction, error: any): Promise<void> {
        console.error('Request carry select menu handler error:', error);
        
        try {
            const errorMessage = "An error occurred while processing your selection. Please try again.";
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (followUpError) {
            console.error('Failed to send select menu error message:', followUpError);
        }
    }
}