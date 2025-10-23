import { ModalSubmitInteraction, MessageFlags } from 'discord.js';
import { RequestCarryData, RequestCarryBuilder } from '../builders/RequestCarryBuilder';
import { RequestCarryButtonHandler } from './ButtonHandler';
import { isInteractionValid, safeUpdate, safeReply } from '../../../../utils/interactionUtils';

export class RequestCarryModalHandler {
    
    static async handle(interaction: ModalSubmitInteraction): Promise<void> {
        if (!isInteractionValid(interaction)) {
            console.warn('Modal interaction expired, cannot process');
            return;
        }

        const customId = interaction.customId;
        const userId = this.extractUserIdFromCustomId(customId);

        if (userId !== interaction.user.id) {
            await safeReply(interaction, {
                content: "❌ This modal is not for you!",
                ephemeral: true
            });
            return;
        }

        try {
            if (customId.includes('_goal_modal_')) {
                await this.handleGoalModal(interaction, userId);
            }
        } catch (error) {
            console.error('Error handling request carry modal:', error);
            await this.handleError(interaction, error);
        }
    }

    private static async handleGoalModal(interaction: ModalSubmitInteraction, userId: string): Promise<void> {
        const goalInput = interaction.fields.getTextInputValue('goal');
        
        if (!goalInput || goalInput.trim().length < 10) {
            await safeReply(interaction, {
                content: "❌ Goal must be at least 10 characters long. Please try again.",
                ephemeral: true
            });
            return;
        }

        if (goalInput.length > 500) {
            await safeReply(interaction, {
                content: "❌ Goal description is too long (max 500 characters). Please shorten it.",
                ephemeral: true
            });
            return;
        }

        const sanitizedGoal = this.sanitizeGoal(goalInput.trim());

        try {
            
            await safeReply(interaction, {
                content: "✅ Goal updated successfully! The form has been updated.",
                ephemeral: true
            });

            await this.syncWithCurrentState(interaction, userId);
            
            const data = RequestCarryButtonHandler.getSessionData(userId);
            data.goal = sanitizedGoal;
            RequestCarryButtonHandler.setSessionData(userId, data);

            try {
                const channel = interaction.channel;
                if (channel && 'messages' in channel) {
                    
                    const messages = await channel.messages.fetch({ limit: 10 });
                    const originalMessage = messages.find(msg => 
                        msg.author.id === interaction.client.user.id && 
                        msg.components.length > 0 &&
                        msg.flags.has('IsComponentsV2')
                    );

                    if (originalMessage) {
                        
                        const builder = new RequestCarryBuilder(data, userId, true);
                        const response = builder.build();

                        await originalMessage.edit({
                            components: response.components,
                            flags: MessageFlags.IsComponentsV2
                        });
                    }
                }
            } catch (updateError) {
                console.warn('Could not update original message:', updateError);
                
            }

        } catch (error) {
            console.error('Error updating goal:', error);
            await safeReply(interaction, {
                content: "❌ Failed to update goal. Please try again.",
                ephemeral: true
            });
        }
    }

    private static sanitizeGoal(goal: string): string {
        
        goal = goal.replace(/\s+/g, ' ').trim();
        
        goal = goal.replace(/[`*_~|]/g, '');
        
        // Limit consecutive special characters
        goal = goal.replace(/[!@#$%^&*(){}[\]+=<>?/\\|]{3,}/g, '');
        
        return goal;
    }

    /**
     * Validate goal content
     */
    private static isValidGoal(goal: string): boolean {
        // Check for inappropriate content patterns
        const inappropriatePatterns = [
            /discord\.gg\/[a-zA-Z0-9]+/i, // Discord invite links
            /https?:\/\/[^\s]+/i, // General URLs
            /@(everyone|here)/i, // Mass mentions
            /nitro|boost|free|hack|cheat/i, // Suspicious keywords
        ];

        for (const pattern of inappropriatePatterns) {
            if (pattern.test(goal)) {
                return false;
            }
        }

        // Check minimum meaningful content
        const words = goal.split(/\s+/).filter(word => word.length > 2);
        if (words.length < 3) {
            return false;
        }

        return true;
    }

    /**
     * Sync session data with current message state
     */
    private static async syncWithCurrentState(interaction: ModalSubmitInteraction, userId: string): Promise<void> {
        try {
            const currentData = RequestCarryButtonHandler.getSessionData(userId);

            if (currentData.game && currentData.gamemode && currentData.canJoinLinks !== undefined) {
                console.log('[MODAL_SYNC] Session data complete, skipping sync');
                return;
            }

            const fullContent = JSON.stringify(interaction.message?.components || {});

            if (!currentData.game) {
                if (fullContent.includes('Anime Last Stand')) {
                    currentData.game = 'als';
                } else if (fullContent.includes('Anime Vanguard')) {
                    currentData.game = 'av';
                } else if (fullContent.includes('Anime Crusaders')) {
                    currentData.game = 'ac';
                }
            }

            if (!currentData.gamemode) {
                const gamemodes = ['spirit-invasion', 'legend-stages', 'sjw-dungeon', 'story', 'raids', 'dungeons', 'survival', 'breach', 'portals', 'rift', 'inf', 'void', 'towers', 'events'];
                for (const gamemode of gamemodes) {
                    if (fullContent.toLowerCase().includes(gamemode)) {
                        currentData.gamemode = gamemode;
                        console.log(`[MODAL_SYNC] Detected gamemode: ${gamemode}`);
                        break;
                    }
                }
            }

            if (currentData.canJoinLinks === undefined) {
                if (fullContent.includes('I can Join Links') ||
                    fullContent.includes('Yes - Can join Discord voice channels') ||
                    fullContent.includes('Can join Discord voice channels and links')) {
                    currentData.canJoinLinks = true;
                } else if (fullContent.includes('I need to add The Helper') ||
                           fullContent.includes('No - Cannot join Discord voice channels') ||
                           fullContent.includes('Cannot join Discord voice channels and links')) {
                    currentData.canJoinLinks = false;
                }
            }

            RequestCarryButtonHandler.setSessionData(userId, currentData);
            console.log('[MODAL_SYNC] Session data after sync:', { game: currentData.game, gamemode: currentData.gamemode, hasGoal: !!currentData.goal, canJoinLinks: currentData.canJoinLinks });
        } catch (error) {
            console.warn('Error syncing session data with current state:', error);
        }
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

    /**
     * Handle errors in modal processing
     */
    private static async handleError(interaction: ModalSubmitInteraction, error: any): Promise<void> {
        console.error('Request carry modal handler error:', error);
        
        try {
            const errorMessage = "❌ An error occurred while processing your input. Please try again.";
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await safeReply(interaction, { content: errorMessage, ephemeral: true });
            }
        } catch (followUpError) {
            console.error('Failed to send modal error message:', followUpError);
        }
    }
}