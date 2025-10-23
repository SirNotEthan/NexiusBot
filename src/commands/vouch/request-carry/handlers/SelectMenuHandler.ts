import { StringSelectMenuInteraction, MessageFlags } from 'discord.js';
import { RequestCarryData, RequestCarryBuilder } from '../builders/RequestCarryBuilder';
import { RequestCarryButtonHandler } from './ButtonHandler';
import { isInteractionValid, safeUpdate } from '../../../../utils/interactionUtils';

export class RequestCarrySelectMenuHandler {
    
    static async handle(interaction: StringSelectMenuInteraction): Promise<void> {
        if (!isInteractionValid(interaction)) {
            console.warn('Select menu interaction expired, cannot process');
            return;
        }

        const customId = interaction.customId;
        const userId = this.extractUserIdFromCustomId(customId);

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

    private static async handleGamemodeSelection(interaction: StringSelectMenuInteraction, userId: string): Promise<void> {
        const selectedGamemode = interaction.values[0];
        
        if (!selectedGamemode) {
            await interaction.reply({
                content: "Invalid gamemode selection. Please try again.",
                ephemeral: true
            });
            return;
        }

        await this.syncWithCurrentState(interaction, userId);

        const data = RequestCarryButtonHandler.getSessionData(userId);
        if (!data.game || !this.isValidGamemode(data.game, selectedGamemode)) {
            await interaction.reply({
                content: "Invalid gamemode for the selected game. Please try again.",
                ephemeral: true
            });
            return;
        }

        try {
            
            data.gamemode = selectedGamemode;
            RequestCarryButtonHandler.setSessionData(userId, data);

            await this.updateInterface(interaction, userId, data);

        } catch (error) {
            console.error('Error updating gamemode:', error);
            await interaction.reply({
                content: "Failed to update gamemode. Please try again.",
                ephemeral: true
            });
        }
    }

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
            
            const data = RequestCarryButtonHandler.getSessionData(userId);
            data.game = selectedGame;
            
            data.gamemode = undefined;
            RequestCarryButtonHandler.setSessionData(userId, data);

            await this.updateInterface(interaction, userId, data);

        } catch (error) {
            console.error('Error updating game:', error);
            await interaction.reply({
                content: "Failed to update game selection. Please try again.",
                ephemeral: true
            });
        }
    }

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
            
            const isAvailable = await this.verifyHelperAvailability(selectedHelper);
            if (!isAvailable) {
                await interaction.reply({
                    content: "Selected helper is no longer available. Please choose another helper.",
                    ephemeral: true
                });
                return;
            }

            const data = RequestCarryButtonHandler.getSessionData(userId);
            data.selectedHelper = selectedHelper;
            RequestCarryButtonHandler.setSessionData(userId, data);

            await this.updateInterface(interaction, userId, data);

        } catch (error) {
            console.error('Error updating helper selection:', error);
            await interaction.reply({
                content: "Failed to update helper selection. Please try again.",
                ephemeral: true
            });
        }
    }

    private static async updateInterface(interaction: StringSelectMenuInteraction, userId: string, data: RequestCarryData): Promise<void> {
        
        const builder = new RequestCarryBuilder(data, userId, true);
        const response = builder.build();

        await safeUpdate(interaction, {
            components: response.components,
            flags: MessageFlags.IsComponentsV2
        });
    }

    private static isValidGame(game: string): boolean {
        const validGames = ['als', 'av', 'ac'];
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
                'survival', 'breach', 'portals', 'inf', 'towers'
            ],
            'ac': [
                'spirit-invasion', 'raids', 'story', 'portals', 'legend-stages'
            ]
        };

        return validGamemodes[game]?.includes(gamemode) || false;
    }

    private static async verifyHelperAvailability(helperId: string): Promise<boolean> {
        
        return true;
    }

    private static extractUserIdFromCustomId(customId: string): string {
        const parts = customId.split('_');
        
        for (let i = 0; i < parts.length; i++) {
            if (parts[i].match(/^\d{17,19}$/)) { 
                return parts[i];
            }
        }
        return '';
    }

    private static async syncWithCurrentState(interaction: StringSelectMenuInteraction, userId: string): Promise<void> {
        try {
            const currentData = RequestCarryButtonHandler.getSessionData(userId);
            
            const fullContent = JSON.stringify(interaction.message?.components || {});
            
            if (fullContent.includes('Anime Last Stand') && !currentData.game) {
                currentData.game = 'als';
            } else if (fullContent.includes('Anime Vanguards') && !currentData.game) {
                currentData.game = 'av';
            } else if (fullContent.includes('Anime Crusaders') && !currentData.game) {
                currentData.game = 'ac';
            }
            
            if (!currentData.goal) {
                const goalMatch = fullContent.match(/Goal Description.*?\[SET\].*?"([^"]+)"/);
                if (goalMatch && goalMatch[1]) {
                    currentData.goal = goalMatch[1];
                }
            }
            
            if (currentData.canJoinLinks === undefined) {
                if (fullContent.includes('I can Join Links')) {
                    currentData.canJoinLinks = true;
                } else if (fullContent.includes('I need to add The Helper')) {
                    currentData.canJoinLinks = false;
                }
            }
            
            RequestCarryButtonHandler.setSessionData(userId, currentData);
        } catch (error) {
            console.warn('Error syncing session data with current state:', error);
        }
    }

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