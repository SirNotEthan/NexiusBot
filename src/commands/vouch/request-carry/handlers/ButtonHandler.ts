import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle } from 'discord.js';
import { RequestCarryData, RequestCarryBuilder } from '../builders/RequestCarryBuilder';
import { RequestCarryUtils } from '../utils/RequestCarryUtils';
import { isInteractionValid, safeReply, safeUpdate } from '../../../../utils/interactionUtils';

// Helper function to get client
function getClient() {
    try {
        return require('../../../../index').client;
    } catch (error) {
        console.error('Error getting client:', error);
        return null;
    }
}

/**
 * Handles all button interactions for the request-carry command
 * Following the new modular structure for better maintainability
 */
export class RequestCarryButtonHandler {
    private static sessionData: Map<string, RequestCarryData> = new Map();

    /**
     * Main entry point for handling button interactions
     */
    static async handle(interaction: ButtonInteraction): Promise<void> {
        if (!isInteractionValid(interaction)) {
            console.warn('Button interaction expired, cannot process');
            return;
        }

        const customId = interaction.customId;
        const userId = this.extractUserIdFromCustomId(customId);

        // Only validate user ID for request-carry form buttons, not for legacy ticket buttons
        const isLegacyTicketButton = customId === 'claim_ticket' || 
                                   customId === 'edit_ticket' || 
                                   customId === 'close_ticket' || 
                                   customId === 'unclaim_ticket' || 
                                   customId === 'ring_helper' ||
                                   (customId.startsWith('ticket_') && 
                                    !(customId.includes('_claim_') || customId.includes('_unclaim_') || customId.includes('_close_')));

        const isNewTicketButton = customId.includes('_claim_') || customId.includes('_unclaim_') || customId.includes('_close_');

        // Verify the interaction is for the correct user (only for request-carry form buttons that have userId)
        if (!isLegacyTicketButton && !isNewTicketButton && userId && userId !== interaction.user.id) {
            await safeReply(interaction, {
                content: "This interaction is not for you!",
                ephemeral: true
            });
            return;
        }

        try {
            // Handle request-carry form buttons
            if (customId.includes('_goal_')) {
                await this.handleGoalButton(interaction, userId);
            } else if (customId.includes('_links_yes_')) {
                await this.handleLinksYesButton(interaction, userId);
            } else if (customId.includes('_links_no_')) {
                await this.handleLinksNoButton(interaction, userId);
            } else if (customId.includes('_submit_')) {
                await this.handleSubmitButton(interaction, userId);
            } else if (customId.includes('_cancel_')) {
                await this.handleCancelButton(interaction, userId);
            } 
            // Handle new ticket control buttons
            else if (customId.includes('_claim_')) {
                await this.handleTicketClaimButton(interaction);
            } else if (customId.includes('_unclaim_')) {
                await this.handleTicketUnclaimButton(interaction);
            } else if (customId.includes('_close_')) {
                await this.handleTicketCloseButton(interaction);
            }
            // Handle legacy ticket buttons
            else if (customId === 'claim_ticket') {
                await this.handleLegacyClaimTicket(interaction);
            } else if (customId === 'edit_ticket') {
                await this.handleLegacyEditTicket(interaction);
            } else if (customId === 'close_ticket') {
                await this.handleLegacyCloseTicket(interaction);
            } else if (customId === 'ring_helper') {
                await this.handleLegacyRingHelper(interaction);
            } else if (customId === 'unclaim_ticket') {
                await this.handleLegacyUnclaimTicket(interaction);
            }
            // Handle legacy support ticket form buttons
            else if (customId.startsWith('ticket_')) {
                await this.handleLegacySupportTicketButtons(interaction);
            }
        } catch (error) {
            console.error('Error handling request carry button:', error);
            await this.handleError(interaction, error);
        }
    }

    /**
     * Handle goal setting button
     */
    private static async handleGoalButton(interaction: ButtonInteraction, userId: string): Promise<void> {
        const modal = this.createGoalModal(userId);
        await interaction.showModal(modal);
    }

    /**
     * Handle "can join links" button
     */
    private static async handleLinksYesButton(interaction: ButtonInteraction, userId: string): Promise<void> {
        // Sync with current message state first
        await this.syncWithCurrentState(interaction, userId);
        
        const data = this.getSessionData(userId);
        data.canJoinLinks = true;
        this.setSessionData(userId, data);

        await this.updateInterfaceCompatible(interaction, userId, data);
    }

    /**
     * Handle "cannot join links" button
     */
    private static async handleLinksNoButton(interaction: ButtonInteraction, userId: string): Promise<void> {
        // Sync with current message state first
        await this.syncWithCurrentState(interaction, userId);
        
        const data = this.getSessionData(userId);
        data.canJoinLinks = false;
        this.setSessionData(userId, data);

        await this.updateInterfaceCompatible(interaction, userId, data);
    }

    /**
     * Handle form submission
     */
    private static async handleSubmitButton(interaction: ButtonInteraction, userId: string): Promise<void> {
        const data = this.getSessionData(userId);
        
        // Validate form completion
        if (!RequestCarryUtils.isFormComplete(data)) {
            await safeReply(interaction, {
                content: "Please complete all required fields before submitting.",
                ephemeral: true
            });
            return;
        }


        try {
            // Create the ticket
            const ticketChannelId = await RequestCarryUtils.createTicket(
                interaction.guild!,
                data,
                userId,
                interaction.user.tag
            );

            // Success response - update with success message using Components V2
            const successContainer = new ContainerBuilder();
            if (!(successContainer as any).components) {
                (successContainer as any).components = [];
            }
            
            const successMessage = new TextDisplayBuilder()
                .setContent(`**✅ Successfully Created Ticket**\n\n<#${ticketChannelId}>`);
            (successContainer as any).components.push(successMessage);

            await safeUpdate(interaction, {
                components: [successContainer],
                flags: MessageFlags.IsComponentsV2
            });

            // Clean up session data
            this.clearSessionData(userId);

        } catch (error) {
            console.error('Error creating ticket:', error);
            await safeReply(interaction, {
                content: "Failed to create ticket. Please try again later.",
                ephemeral: true
            });
        }
    }

    /**
     * Handle form cancellation
     */
    private static async handleCancelButton(interaction: ButtonInteraction, userId: string): Promise<void> {
        // Cancel response using Components V2
        const cancelContainer = new ContainerBuilder();
        if (!(cancelContainer as any).components) {
            (cancelContainer as any).components = [];
        }
        
        const cancelMessage = new TextDisplayBuilder()
            .setContent("**❌ Carry request cancelled.**");
        (cancelContainer as any).components.push(cancelMessage);

        await safeUpdate(interaction, {
            components: [cancelContainer],
            flags: MessageFlags.IsComponentsV2
        });

        this.clearSessionData(userId);
    }

    /**
     * Update the interface with new data using the compatible system
     */
    private static async updateInterfaceCompatible(interaction: ButtonInteraction, userId: string, data: RequestCarryData): Promise<void> {
        // Convert to VouchTicketData format for compatibility
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

        await safeUpdate(interaction, {
            components: components,
            flags: MessageFlags.IsComponentsV2
        });
    }

    /**
     * Update the interface with new data (original method for new builder)
     */
    private static async updateInterface(interaction: ButtonInteraction, userId: string, data: RequestCarryData): Promise<void> {
        const builder = new RequestCarryBuilder(data, userId, true);
        const response = builder.build();

        await safeUpdate(interaction, {
            components: response.components,
            flags: MessageFlags.IsComponentsV2
        });
    }

    /**
     * Sync session data with current message state
     */
    private static async syncWithCurrentState(interaction: ButtonInteraction, userId: string): Promise<void> {
        try {
            const currentData = this.getSessionData(userId);
            
            // Parse current state from message components (similar to what we did in modal handler)
            const fullContent = JSON.stringify(interaction.message?.components || {});
            
            // Parse game from display text
            if (fullContent.includes('Anime Last Stand') && !currentData.game) {
                currentData.game = 'als';
            } else if (fullContent.includes('Anime Vanguard') && !currentData.game) {
                currentData.game = 'av';
            }
            
            // Try to parse gamemode - look for common gamemode values
            if (!currentData.gamemode) {
                const gamemodes = ['story', 'legend-stages', 'raids', 'dungeons', 'survival', 'breach', 'portals', 'rift', 'inf', 'sjw-dungeon', 'void', 'towers', 'events'];
                for (const gamemode of gamemodes) {
                    if (fullContent.toLowerCase().includes(gamemode)) {
                        currentData.gamemode = gamemode;
                        break;
                    }
                }
            }
            
            // Try to parse existing goal
            if (!currentData.goal) {
                const goalMatch = fullContent.match(/Goal Description.*?\[SET\].*?"([^"]+)"/);
                if (goalMatch && goalMatch[1]) {
                    currentData.goal = goalMatch[1];
                }
            }
            
            this.setSessionData(userId, currentData);
        } catch (error) {
            console.warn('Error syncing session data with current state:', error);
        }
    }

    /**
     * Create goal setting modal
     */
    private static createGoalModal(userId: string): ModalBuilder {
        const modal = new ModalBuilder()
            .setCustomId(`request_carry_goal_modal_${userId}`)
            .setTitle('Set Your Goal');

        const goalInput = new TextInputBuilder()
            .setCustomId('goal')
            .setLabel('What do you need help with?')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Describe what you want to achieve...\nExample: "Clear Chapter 5 Boss" or "Get to Wave 50 in Survival"')
            .setMinLength(10)
            .setMaxLength(500)
            .setRequired(true);

        const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(goalInput);
        modal.addComponents(actionRow);

        return modal;
    }

    /**
     * Session data management
     */
    static getSessionData(userId: string): RequestCarryData {
        return this.sessionData.get(userId) || { type: 'regular' };
    }

    static setSessionData(userId: string, data: RequestCarryData): void {
        this.sessionData.set(userId, data);
    }

    static clearSessionData(userId: string): void {
        this.sessionData.delete(userId);
    }

    /**
     * Utility methods
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
     * Handle ticket claim button
     */
    private static async handleTicketClaimButton(interaction: ButtonInteraction): Promise<void> {
        const ticketNumber = this.extractTicketNumberFromCustomId(interaction.customId);
        
        console.log(`[TICKET_CLAIM] CustomId: ${interaction.customId}, Extracted ticket number: ${ticketNumber}`);
        
        if (!ticketNumber) {
            await safeReply(interaction, {
                content: "❌ **Invalid ticket number in button ID.**",
                ephemeral: true
            });
            return;
        }
        
        try {
            // Import Database here to avoid circular dependencies
            const Database = (await import('../../../../database/database')).default;
            const db = new Database();
            await db.connect();
            
            try {
                // Check if ticket exists and is not already claimed
                console.log(`[TICKET_CLAIM] Looking up ticket number: ${ticketNumber}`);
                const ticket = await db.getTicket(ticketNumber);
                console.log(`[TICKET_CLAIM] Database result:`, ticket);
                
                if (!ticket) {
                    await safeReply(interaction, {
                        content: `❌ **Ticket #${ticketNumber} not found in database.**`,
                        ephemeral: true
                    });
                    return;
                }

                // Check if user has permission for this game
                const hasPermission = await this.hasGameHelperPermission(interaction, ticket.game);
                if (!hasPermission) {
                    await safeReply(interaction, {
                        content: `❌ **You don't have permission to claim ${ticket.game.toUpperCase()} tickets.**\n\nOnly ${ticket.game.toUpperCase()} helpers can interact with this ticket.`,
                        ephemeral: true
                    });
                    return;
                }
                
                if (ticket.status === 'claimed') {
                    await safeReply(interaction, {
                        content: `❌ **Ticket already claimed by <@${ticket.claimed_by}>.**`,
                        ephemeral: true
                    });
                    return;
                }
                
                // Claim the ticket
                await db.claimTicket(ticketNumber, interaction.user.id, interaction.user.tag);

                console.log(`[CLAIM_DEBUG] Ticket #${ticketNumber} claimed by ${interaction.user.tag} (${interaction.user.id})`);

                await safeReply(interaction, {
                    content: `✅ **Ticket #${ticketNumber} claimed successfully!**\n\nYou are now assigned to help this user.`,
                    ephemeral: true
                });

                console.log(`[CLAIM_DEBUG] Updating ticket message to show claimed status for #${ticketNumber}`);
                // Update the ticket message to show claimed status
                await this.updateNewTicketMessage(interaction, ticket, 'claimed', interaction.user);

                console.log(`[CLAIM_DEBUG] Updating control buttons to show unclaim button for #${ticketNumber}`);
                // Update the control buttons to show unclaim instead of claim
                await this.updateTicketControlButtons(interaction, ticketNumber, 'claimed');

                // Notify in the channel
                await interaction.followUp({
                    content: `🤝 **Ticket claimed by <@${interaction.user.id}>**\n\nThe helper will assist you shortly.`
                });
                
            } finally {
                await db.close();
            }
        } catch (error) {
            console.error('Error claiming ticket:', error);
            await safeReply(interaction, {
                content: "❌ **Failed to claim ticket. Please try again.**",
                ephemeral: true
            });
        }
    }

    /**
     * Handle ticket unclaim button
     */
    private static async handleTicketUnclaimButton(interaction: ButtonInteraction): Promise<void> {
        const ticketNumber = this.extractTicketNumberFromCustomId(interaction.customId);
        
        try {
            const Database = (await import('../../../../database/database')).default;
            const db = new Database();
            await db.connect();
            
            try {
                // Check if ticket exists and is claimed by this user
                const ticket = await db.getTicket(ticketNumber);
                if (!ticket) {
                    await safeReply(interaction, {
                        content: "❌ **Ticket not found.**",
                        ephemeral: true
                    });
                    return;
                }

                // Check if user has permission for this game
                const hasPermission = await this.hasGameHelperPermission(interaction, ticket.game);
                if (!hasPermission) {
                    await safeReply(interaction, {
                        content: `❌ **You don't have permission to unclaim ${ticket.game.toUpperCase()} tickets.**\n\nOnly ${ticket.game.toUpperCase()} helpers can interact with this ticket.`,
                        ephemeral: true
                    });
                    return;
                }
                
                if (ticket.status !== 'claimed') {
                    await safeReply(interaction, {
                        content: "❌ **Ticket is not currently claimed.**",
                        ephemeral: true
                    });
                    return;
                }
                
                if (ticket.claimed_by !== interaction.user.id) {
                    await safeReply(interaction, {
                        content: "❌ **You can only unclaim tickets you have claimed.**",
                        ephemeral: true
                    });
                    return;
                }
                
                // Unclaim the ticket
                await db.unclaimTicket(ticketNumber);

                console.log(`[UNCLAIM_DEBUG] Ticket #${ticketNumber} unclaimed from database`);

                await safeReply(interaction, {
                    content: `✅ **Ticket #${ticketNumber} unclaimed successfully.**\n\nThe ticket is now available for other helpers.`,
                    ephemeral: true
                });

                console.log(`[UNCLAIM_DEBUG] Updating ticket message to show open status for #${ticketNumber}`);
                // Update the ticket message to show open status
                await this.updateNewTicketMessage(interaction, ticket, 'open');

                console.log(`[UNCLAIM_DEBUG] Updating control buttons to show claim button for #${ticketNumber}`);
                // Update the control buttons to show claim instead of unclaim
                await this.updateTicketControlButtons(interaction, ticketNumber, 'open');

                // Notify in the channel
                await interaction.followUp({
                    content: `🔄 **Ticket unclaimed**\n\nThis ticket is now available for other helpers to claim.`
                });
                
            } finally {
                await db.close();
            }
        } catch (error) {
            console.error('Error unclaiming ticket:', error);
            await safeReply(interaction, {
                content: "❌ **Failed to unclaim ticket. Please try again.**",
                ephemeral: true
            });
        }
    }

    /**
     * Handle ticket close button
     */
    private static async handleTicketCloseButton(interaction: ButtonInteraction): Promise<void> {
        const ticketNumber = this.extractTicketNumberFromCustomId(interaction.customId);
        
        try {
            const Database = (await import('../../../../database/database')).default;
            const db = new Database();
            await db.connect();
            
            try {
                // Check if ticket exists
                const ticket = await db.getTicket(ticketNumber);
                if (!ticket) {
                    await safeReply(interaction, {
                        content: "❌ **Ticket not found.**",
                        ephemeral: true
                    });
                    return;
                }
                
                if (ticket.status === 'closed') {
                    await safeReply(interaction, {
                        content: "❌ **Ticket is already closed.**",
                        ephemeral: true
                    });
                    return;
                }

                // Check if user has permission for this game
                const hasGamePermission = await this.hasGameHelperPermission(interaction, ticket.game);
                
                // Check if user has permission to close (ticket owner, claimed helper, or game helper)
                const canClose = ticket.user_id === interaction.user.id || 
                               ticket.claimed_by === interaction.user.id ||
                               hasGamePermission ||
                               interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
                               
                if (!canClose) {
                    await safeReply(interaction, {
                        content: `❌ **You don't have permission to close this ticket.**\n\nOnly the ticket owner, claimed helper, ${ticket.game.toUpperCase()} helpers, or administrators can close this ticket.`,
                        ephemeral: true
                    });
                    return;
                }
                
                // Close the ticket in database
                await db.closeTicket(ticketNumber);

                await safeReply(interaction, {
                    content: `✅ **Ticket #${ticketNumber} closed successfully.**`,
                    ephemeral: true
                });

                // Start the ticket closure workflow (transcript + review + cleanup)
                await this.initiateTicketClosureWorkflow(interaction, ticket, interaction.user);
                
            } finally {
                await db.close();
            }
        } catch (error) {
            console.error('Error closing ticket:', error);
            await safeReply(interaction, {
                content: "❌ **Failed to close ticket. Please try again.**",
                ephemeral: true
            });
        }
    }

    /**
     * Extract ticket number from custom ID
     */
    private static extractTicketNumberFromCustomId(customId: string): string {
        const parts = customId.split('_');
        // Find the numeric part that represents the ticket number
        for (const part of parts) {
            if (/^\d+$/.test(part)) {
                return part;
            }
        }
        return '';
    }

    /**
     * Check if user has permission to interact with tickets for a specific game
     */
    private static async hasGameHelperPermission(interaction: ButtonInteraction, game: string): Promise<boolean> {
        try {
            // Get the helper role ID for the game
            const gamePrefix = game.toUpperCase();
            const helperRoleId = process.env[`${gamePrefix}_HELPER_ROLE_ID`];
            
            if (!helperRoleId) {
                console.warn(`No helper role configured for game: ${game}`);
                return false;
            }

            // Check if user has the helper role
            const member = interaction.member;
            if (!member) {
                return false;
            }

            // Check if user has the specific game helper role
            let hasRole = false;
            if ('roles' in member && member.roles && 'cache' in member.roles) {
                hasRole = member.roles.cache.has(helperRoleId);
            } else if (Array.isArray(member.roles)) {
                hasRole = member.roles.includes(helperRoleId);
            }
            
            // Also check for admin permissions as fallback
            const hasManageChannels = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
            
            return hasRole || hasManageChannels || false;
        } catch (error) {
            console.error('Error checking game helper permission:', error);
            return false;
        }
    }

    /**
     * Update ticket control buttons based on new status
     */
    private static async updateTicketControlButtons(interaction: ButtonInteraction, ticketNumber: string, newStatus: 'open' | 'claimed' | 'closed'): Promise<void> {
        try {
            const { RequestCarryUtils } = await import('../utils/RequestCarryUtils');

            // Create new buttons based on status
            const newButtons = RequestCarryUtils.createTicketControlButtons(parseInt(ticketNumber), newStatus);

            console.log(`[BUTTON_DEBUG] Created ${newButtons.length} buttons for ticket #${ticketNumber} with status ${newStatus}`);

            // Validate that we have buttons before creating the row
            if (newButtons.length === 0) {
                console.error(`[BUTTON_DEBUG] No buttons generated for ticket #${ticketNumber} with status ${newStatus}`);
                return;
            }

            // Create new container with updated buttons
            const controlContainer = new ContainerBuilder();
            if (!(controlContainer as any).components) {
                (controlContainer as any).components = [];
            }

            // Add button row to container (no text, just buttons)
            try {
                const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(newButtons);
                (controlContainer as any).components.push(buttonRow);
                console.log(`[BUTTON_DEBUG] Successfully created button row with ${buttonRow.components.length} components`);
            } catch (buttonError) {
                console.error(`[BUTTON_DEBUG] Error creating button row:`, buttonError);
                return;
            }

            // Find the control message in the channel (it should be the second message)
            const channel = interaction.channel;
            if (channel && 'messages' in channel) {
                const messages = await channel.messages.fetch({ limit: 10 });
                const controlMessage = messages.find(msg => {
                    if (!msg.components || msg.components.length === 0) return false;

                    // Look for messages with Components V2 flag that contain ticket control buttons
                    if (!msg.flags?.has(MessageFlags.IsComponentsV2)) return false;

                    for (const component of msg.components) {
                        if ('components' in component && component.components) {
                            for (const subComp of component.components) {
                                if ('customId' in subComp && subComp.customId && (
                                    subComp.customId.includes('ticket_claim_') ||
                                    subComp.customId.includes('ticket_unclaim_') ||
                                    subComp.customId.includes('ticket_close_')
                                )) {
                                    return true;
                                }
                            }
                        }
                    }
                    return false;
                });

                if (controlMessage) {
                    console.log(`[UNCLAIM_DEBUG] Found control message, updating buttons for ticket #${ticketNumber} to status: ${newStatus}`);
                    await controlMessage.edit({
                        components: [controlContainer],
                        flags: MessageFlags.IsComponentsV2
                    });
                    console.log(`[UNCLAIM_DEBUG] Successfully updated control buttons for ticket #${ticketNumber}`);
                } else {
                    console.warn(`[UNCLAIM_DEBUG] Could not find control message to update for ticket #${ticketNumber}`);

                    // Log available messages for debugging
                    console.log(`[UNCLAIM_DEBUG] Available messages in channel:`);
                    messages.forEach((msg, index) => {
                        console.log(`  Message ${index}: hasComponents=${!!msg.components?.length}, isV2=${!!msg.flags?.has(MessageFlags.IsComponentsV2)}, author=${msg.author.tag}`);
                    });
                }
            }
        } catch (error) {
            console.error('Error updating ticket control buttons:', error);
        }
    }

    /**
     * Handle legacy claim ticket button (claim_ticket)
     */
    private static async handleLegacyClaimTicket(interaction: ButtonInteraction): Promise<void> {
        try {
            const Database = (await import('../../../../database/database')).default;
            const db = new Database();
            await db.connect();
            
            try {
                // Get ticket by channel ID for legacy tickets
                const ticket = await db.getTicketByChannelId(interaction.channelId);
                
                if (!ticket) {
                    await safeReply(interaction, {
                        content: "❌ **Ticket not found in database.**",
                        ephemeral: true
                    });
                    return;
                }

                // Check game-specific permissions if ticket has game info
                if (ticket.game) {
                    const hasPermission = await this.hasGameHelperPermission(interaction, ticket.game);
                    if (!hasPermission) {
                        await safeReply(interaction, {
                            content: `❌ **You don't have permission to claim ${ticket.game.toUpperCase()} tickets.**\n\nOnly ${ticket.game.toUpperCase()} helpers can interact with this ticket.`,
                            ephemeral: true
                        });
                        return;
                    }
                }

                if (ticket.status === 'claimed') {
                    await safeReply(interaction, {
                        content: `❌ **Ticket already claimed by <@${ticket.claimed_by}>.**`,
                        ephemeral: true
                    });
                    return;
                }

                if (ticket.status === 'closed') {
                    await safeReply(interaction, {
                        content: "❌ **This ticket is already closed!**",
                        ephemeral: true
                    });
                    return;
                }

                // Claim the ticket
                await db.claimTicket(ticket.ticket_number, interaction.user.id, interaction.user.tag);

                // Update the message to show claimed status
                await this.updateLegacyTicketMessage(interaction, ticket, 'claimed');

                await safeReply(interaction, {
                    content: `✅ **Ticket #${ticket.ticket_number} claimed successfully!**`,
                    ephemeral: true
                });

                // Send public notification
                await interaction.followUp({
                    content: `🤝 **This ticket has been claimed by ${interaction.user}**\n\nThey will be assisting you with your request.`
                });

            } finally {
                await db.close();
            }
        } catch (error) {
            console.error('Error in legacy claim ticket:', error);
            await this.handleError(interaction, error);
        }
    }

    /**
     * Handle legacy edit ticket button (edit_ticket)
     */
    private static async handleLegacyEditTicket(interaction: ButtonInteraction): Promise<void> {
        try {
            const Database = (await import('../../../../database/database')).default;
            const db = new Database();
            await db.connect();
            
            try {
                const ticket = await db.getTicketByChannelId(interaction.channelId);
                
                if (!ticket) {
                    await safeReply(interaction, {
                        content: "❌ **Ticket not found in database.**",
                        ephemeral: true
                    });
                    return;
                }

                if (ticket.status === 'closed') {
                    await safeReply(interaction, {
                        content: "❌ **This ticket is already closed and cannot be edited!**",
                        ephemeral: true
                    });
                    return;
                }

                const isOwner = ticket.user_id === interaction.user.id;
                const isClaimer = ticket.claimed_by === interaction.user.id;
                
                if (!isOwner && !isClaimer) {
                    await safeReply(interaction, {
                        content: "❌ **You don't have permission to edit this ticket.**\n\nOnly the ticket creator or the helper who claimed it can edit this ticket.",
                        ephemeral: true
                    });
                    return;
                }

                // Show edit modal
                await this.showEditTicketModal(interaction, ticket);

            } finally {
                await db.close();
            }
        } catch (error) {
            console.error('Error in legacy edit ticket:', error);
            await this.handleError(interaction, error);
        }
    }

    /**
     * Handle legacy close ticket button (close_ticket)
     */
    private static async handleLegacyCloseTicket(interaction: ButtonInteraction): Promise<void> {
        try {
            const Database = (await import('../../../../database/database')).default;
            const db = new Database();
            await db.connect();
            
            try {
                const ticket = await db.getTicketByChannelId(interaction.channelId);
                
                if (!ticket) {
                    await safeReply(interaction, {
                        content: "❌ **Ticket not found in database.**",
                        ephemeral: true
                    });
                    return;
                }

                if (ticket.status === 'closed') {
                    await safeReply(interaction, {
                        content: "❌ **Ticket is already closed.**",
                        ephemeral: true
                    });
                    return;
                }

                // Check permissions
                const isOwner = ticket.user_id === interaction.user.id;
                const isClaimer = ticket.claimed_by === interaction.user.id;
                const hasGamePermission = ticket.game ? await this.hasGameHelperPermission(interaction, ticket.game) : false;
                const hasManageChannels = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
                
                const canClose = isOwner || isClaimer || hasGamePermission || hasManageChannels;
                
                if (!canClose) {
                    await safeReply(interaction, {
                        content: "❌ **You don't have permission to close this ticket.**\n\nOnly the ticket owner, claimed helper, game helpers, or administrators can close this ticket.",
                        ephemeral: true
                    });
                    return;
                }

                // Close the ticket
                await db.closeTicket(ticket.ticket_number);

                await safeReply(interaction, {
                    content: `✅ **Ticket #${ticket.ticket_number} closed successfully.**`,
                    ephemeral: true
                });

                // Start the ticket closure workflow (transcript + review + cleanup)
                await this.initiateTicketClosureWorkflow(interaction, ticket, interaction.user);

            } finally {
                await db.close();
            }
        } catch (error) {
            console.error('Error in legacy close ticket:', error);
            await this.handleError(interaction, error);
        }
    }

    /**
     * Handle legacy unclaim ticket button (unclaim_ticket)
     */
    private static async handleLegacyUnclaimTicket(interaction: ButtonInteraction): Promise<void> {
        try {
            const Database = (await import('../../../../database/database')).default;
            const db = new Database();
            await db.connect();
            
            try {
                const ticket = await db.getTicketByChannelId(interaction.channelId);
                
                if (!ticket) {
                    await safeReply(interaction, {
                        content: "❌ **Ticket not found in database.**",
                        ephemeral: true
                    });
                    return;
                }

                if (ticket.status !== 'claimed') {
                    await safeReply(interaction, {
                        content: "❌ **Ticket is not currently claimed.**",
                        ephemeral: true
                    });
                    return;
                }

                if (ticket.claimed_by !== interaction.user.id) {
                    await safeReply(interaction, {
                        content: "❌ **You can only unclaim tickets you have claimed.**",
                        ephemeral: true
                    });
                    return;
                }

                // Unclaim the ticket
                await db.unclaimTicket(ticket.ticket_number);

                await safeReply(interaction, {
                    content: `✅ **Ticket #${ticket.ticket_number} unclaimed successfully.**`,
                    ephemeral: true
                });

                // Update message to show open status
                await this.updateLegacyTicketMessage(interaction, ticket, 'open');

            } finally {
                await db.close();
            }
        } catch (error) {
            console.error('Error in legacy unclaim ticket:', error);
            await this.handleError(interaction, error);
        }
    }

    /**
     * Handle legacy ring helper button (ring_helper)
     */
    private static async handleLegacyRingHelper(interaction: ButtonInteraction): Promise<void> {
        await safeReply(interaction, {
            content: "🔔 **Helper ping feature is currently disabled.**\n\nPlease wait for a helper to respond or contact staff if urgent.",
            ephemeral: true
        });
    }

    /**
     * Handle legacy support ticket form buttons (ticket_category, ticket_subject, etc.)
     */
    private static async handleLegacySupportTicketButtons(interaction: ButtonInteraction): Promise<void> {
        await safeReply(interaction, {
            content: "🔄 **Legacy ticket system is being updated.**\n\nPlease use the new `/request-carry` command for carry requests, or contact staff for other support needs.",
            ephemeral: true
        });
    }

    /**
     * Show edit ticket modal for legacy tickets
     */
    private static async showEditTicketModal(interaction: ButtonInteraction, ticket: any): Promise<void> {
        const modal = new ModalBuilder()
            .setCustomId(`edit_ticket_modal_${ticket.ticket_number}`)
            .setTitle(`Edit Ticket #${ticket.ticket_number}`);

        const gamemodeInput = new TextInputBuilder()
            .setCustomId('edit_gamemode')
            .setLabel('Gamemode')
            .setStyle(TextInputStyle.Short)
            .setValue(ticket.gamemode || '')
            .setRequired(true)
            .setMaxLength(100);

        const goalInput = new TextInputBuilder()
            .setCustomId('edit_goal')
            .setLabel('Goal/Objective')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(ticket.goal || '')
            .setRequired(true)
            .setMaxLength(500);

        const contactInput = new TextInputBuilder()
            .setCustomId('edit_contact')
            .setLabel('Contact Information')
            .setStyle(TextInputStyle.Short)
            .setValue(ticket.contact || '')
            .setRequired(true)
            .setMaxLength(200);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(gamemodeInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(goalInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(contactInput)
        );

        await interaction.showModal(modal);
    }

    /**
     * Update legacy ticket message with new status
     */
    private static async updateLegacyTicketMessage(interaction: ButtonInteraction, ticket: any, newStatus: 'open' | 'claimed' | 'closed'): Promise<void> {
        try {
            const originalMessage = interaction.message;
            const originalEmbed = originalMessage?.embeds[0];

            if (!originalEmbed) return;

            // Create updated embed
            const updatedEmbed = new EmbedBuilder()
                .setTitle(originalEmbed.title || `🎫 Ticket #${ticket.ticket_number}`)
                .setColor(newStatus === 'open' ? 0xffff00 : newStatus === 'claimed' ? 0x00ff00 : 0x808080)
                .setTimestamp();

            // Update description with new status
            const statusEmoji = newStatus === 'open' ? '🟡' : newStatus === 'claimed' ? '🟢' : '🔒';
            const statusText = newStatus === 'open' ? 'Open' : newStatus === 'claimed' ? 'Claimed' : 'Closed';
            
            updatedEmbed.setDescription(`**Ticket ID:** \`#${ticket.ticket_number}\`\n**Status:** ${statusEmoji} ${statusText}`);

            // Add fields from original embed and update claimed by field
            if (originalEmbed.fields) {
                const fields = [...originalEmbed.fields];
                
                // Remove old claimed by field if exists
                const claimedIndex = fields.findIndex(f => f.name.includes('Claimed by'));
                if (claimedIndex !== -1) {
                    fields.splice(claimedIndex, 1);
                }

                // Add claimed by field if ticket is claimed
                if (newStatus === 'claimed') {
                    fields.push({
                        name: "🤝 **Claimed by**",
                        value: `${interaction.user} (\`${interaction.user.tag}\`)`,
                        inline: false
                    });
                }

                updatedEmbed.addFields(fields);
            }

            // Create updated buttons based on status
            const buttons: ButtonBuilder[] = [];
            
            if (newStatus === 'open') {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId('claim_ticket')
                        .setLabel('Claim Ticket')
                        .setEmoji('✋')
                        .setStyle(ButtonStyle.Success)
                );
            } else if (newStatus === 'claimed') {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId('unclaim_ticket')
                        .setLabel('Unclaim Ticket')
                        .setEmoji('❌')
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            if (newStatus !== 'closed') {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId('edit_ticket')
                        .setLabel('Edit Ticket')
                        .setEmoji('✏️')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('Close Ticket')
                        .setEmoji('🔒')
                        .setStyle(ButtonStyle.Danger)
                );
            }

            const components = buttons.length > 0 ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [];

            await interaction.editReply({
                embeds: [updatedEmbed],
                components
            });

        } catch (error) {
            console.error('Error updating legacy ticket message:', error);
        }
    }

    /**
     * Update new ticket message (Components V2) with status changes
     */
    private static async updateNewTicketMessage(interaction: ButtonInteraction, ticket: any, newStatus: 'open' | 'claimed' | 'closed', claimedBy?: any): Promise<void> {
        try {
            const channel = interaction.channel;
            if (!channel || !('messages' in channel)) return;

            // Find the ticket information message (Components V2 message that doesn't have buttons)
            const messages = await channel.messages.fetch({ limit: 10 });
            const ticketMessage = messages.find(msg => {
                // Look for Components V2 message with ticket header
                if (!msg.flags?.has(MessageFlags.IsComponentsV2)) return false;
                if (!msg.components || msg.components.length === 0) return false;

                // Check if this is the ticket info message (not the buttons message)
                const hasTicketButtons = msg.components.some((component: any) =>
                    component.components &&
                    component.components.some((comp: any) =>
                        comp.customId && (
                            comp.customId.includes('ticket_claim_') ||
                            comp.customId.includes('ticket_unclaim_') ||
                            comp.customId.includes('ticket_close_')
                        )
                    )
                );

                return !hasTicketButtons; // Return the message that doesn't have buttons
            });

            if (!ticketMessage) {
                console.warn(`[UPDATE_MESSAGE_DEBUG] Could not find ticket message to update for ticket #${ticket.ticket_number}`);

                // Log available messages for debugging
                console.log(`[UPDATE_MESSAGE_DEBUG] Available messages in channel:`);
                messages.forEach((msg, index) => {
                    const hasComponents = !!msg.components?.length;
                    const isV2 = !!msg.flags?.has(MessageFlags.IsComponentsV2);
                    const hasButtons = hasComponents ? msg.components.some((comp: any) =>
                        comp.components?.some((subComp: any) =>
                            subComp.customId?.includes('ticket_')
                        )
                    ) : false;
                    console.log(`  Message ${index}: hasComponents=${hasComponents}, isV2=${isV2}, hasButtons=${hasButtons}, author=${msg.author.tag}`);
                });

                return;
            }

            console.log(`[UPDATE_MESSAGE_DEBUG] Found ticket message for #${ticket.ticket_number}, updating to status: ${newStatus}`);

            // Create updated ticket container
            const ticketContainer = new ContainerBuilder();

            // Add header with status
            const statusEmoji = newStatus === 'open' ? '🟡' : newStatus === 'claimed' ? '🟢' : '🔒';
            const statusText = newStatus === 'open' ? 'Open' : newStatus === 'claimed' ? 'Claimed' : 'Closed';

            let headerContent = `# 🎫 Carry Request #${ticket.ticket_number}`;
            if (newStatus === 'claimed' && claimedBy) {
                headerContent += `\n\n## 👤 Claimed By: <@${claimedBy.id}>`;
            } else if (newStatus === 'closed') {
                headerContent += `\n\n## 🔒 Ticket Closed`;
            } else if (newStatus === 'open') {
                headerContent += `\n\n## 🟡 Status: Available for Claim`;
            }
            
            const headerSection = new TextDisplayBuilder()
                .setContent(headerContent);
            
            // Add all the ticket information in a details section
            const detailsContent = [
                `**🎮 Game:** ${ticket.game ? ticket.game.toUpperCase() : 'Unknown'}`,
                `**🎯 Gamemode:** ${ticket.gamemode || 'Not specified'}`,
                `**📝 Type:** ${ticket.type === 'paid' ? 'Paid Help' : 'Regular Help'}`,
                `**👤 Requested by:** <@${ticket.user_id}>`,
                `**🔗 Can Join Links:** ${ticket.contact ? 'Yes' : 'No'}`,
                `**📋 Goal:** ${ticket.goal || 'Not specified'}`,
                `**📅 Created:** <t:${Math.floor(ticket.created_at / 1000)}:f>`
            ];

            if (newStatus === 'claimed' && claimedBy) {
                detailsContent.push(`**⏰ Claimed:** <t:${Math.floor(Date.now() / 1000)}:f>`);
            } else if (newStatus === 'closed') {
                detailsContent.push(`**🔒 Closed:** <t:${Math.floor(Date.now() / 1000)}:f>`);
            }
            
            const detailsSection = new TextDisplayBuilder()
                .setContent(detailsContent.join('\n'));
            
            // Add components to container using the proper method
            if (!(ticketContainer as any).components) {
                (ticketContainer as any).components = [];
            }
            (ticketContainer as any).components.push(headerSection);
            (ticketContainer as any).components.push(detailsSection);

            await ticketMessage.edit({
                components: [ticketContainer],
                flags: MessageFlags.IsComponentsV2
            });

            console.log(`[UPDATE_MESSAGE_DEBUG] Successfully updated ticket message for #${ticket.ticket_number} with status: ${newStatus}`);

        } catch (error) {
            console.error('Error updating new ticket message:', error);
        }
    }

    /**
     * Initiate the complete ticket closure workflow
     */
    private static async initiateTicketClosureWorkflow(interaction: ButtonInteraction, ticket: any, closedBy: any): Promise<void> {
        try {
            // Notify in the channel first
            await interaction.followUp({
                content: `🔒 **Ticket closed by <@${closedBy.id}>**\n\nGenerating transcript and preparing review system...`
            });

            // Generate transcript
            const transcriptBuffer = await this.generateTranscript(interaction, ticket, closedBy);
            
            // Send transcript to appropriate channel
            await this.sendTranscriptToChannel(interaction, ticket, transcriptBuffer, closedBy);
            
            // If ticket was claimed, show review system to ticket creator
            if (ticket.claimed_by && ticket.user_id !== closedBy.id) {
                await this.showReviewSystem(interaction, ticket);
            } else {
                // If no review needed, finalize closure immediately
                await this.finalizeTicketClosure(interaction, ticket, transcriptBuffer);
            }

        } catch (error) {
            console.error('Error in ticket closure workflow:', error);
            // Fallback - just archive the channel
            setTimeout(async () => {
                try {
                    const channel = interaction.channel;
                    if (channel && 'setArchived' in channel) {
                        await (channel as any).setArchived(true);
                    }
                } catch (archiveError) {
                    console.error('Error archiving channel:', archiveError);
                }
            }, 10000);
        }
    }

    /**
     * Generate transcript of the ticket conversation
     */
    private static async generateTranscript(interaction: ButtonInteraction, ticket: any, closedBy: any): Promise<Buffer> {
        try {
            const channel = interaction.channel;
            if (!channel || !('messages' in channel)) {
                throw new Error('Cannot fetch messages from this channel');
            }

            // Fetch all messages in the channel
            const messages = await channel.messages.fetch({ limit: 100 });
            const sortedMessages = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

            // Format transcript
            const lines: string[] = [];
            
            lines.push('='.repeat(80));
            lines.push(`CARRY REQUEST TRANSCRIPT - #${ticket.ticket_number}`);
            lines.push('='.repeat(80));
            lines.push('');
            
            lines.push('TICKET INFORMATION:');
            lines.push(`  Ticket ID: #${ticket.ticket_number}`);
            lines.push(`  Submitted by: ${ticket.user_tag} (${ticket.user_id})`);
            lines.push(`  Game: ${ticket.game || 'Unknown'}`);
            lines.push(`  Gamemode: ${ticket.gamemode || 'Not specified'}`);
            lines.push(`  Goal: ${ticket.goal || 'Not specified'}`);
            lines.push(`  Type: ${ticket.type || 'regular'}`);
            lines.push(`  Created: ${new Date(ticket.created_at).toISOString()}`);
            lines.push(`  Closed: ${new Date().toISOString()}`);
            lines.push(`  Closed by: ${closedBy.tag} (${closedBy.id})`);
            if (ticket.claimed_by) {
                lines.push(`  Claimed by: ${ticket.claimed_by_tag} (${ticket.claimed_by})`);
            }
            lines.push('');
            
            lines.push('CHANNEL MESSAGES:');
            lines.push('-'.repeat(80));
            lines.push('');
            
            for (const message of sortedMessages) {
                const timestamp = message.createdAt.toISOString();
                const author = `${message.author.tag} (${message.author.id})`;
                const content = message.content || '[No text content]';
                
                lines.push(`[${timestamp}] ${author}:`);
                
                if (message.content) {
                    const contentLines = content.split('\n');
                    contentLines.forEach(line => {
                        lines.push(`  ${line}`);
                    });
                }
                
                if (message.attachments.size > 0) {
                    lines.push('  [ATTACHMENTS]:');
                    message.attachments.forEach(attachment => {
                        lines.push(`    - ${attachment.name} (${attachment.url})`);
                    });
                }
                
                if (message.embeds.length > 0) {
                    lines.push('  [EMBEDS]:');
                    message.embeds.forEach((embed, index) => {
                        lines.push(`    Embed ${index + 1}:`);
                        if (embed.title) lines.push(`      Title: ${embed.title}`);
                        if (embed.description) lines.push(`      Description: ${embed.description}`);
                    });
                }
                
                lines.push('');
            }
            
            lines.push('='.repeat(80));
            lines.push('END OF TRANSCRIPT');
            lines.push('='.repeat(80));

            return Buffer.from(lines.join('\n'), 'utf-8');

        } catch (error) {
            console.error('Error generating transcript:', error);
            return Buffer.from(`Transcript generation failed: ${error}`, 'utf-8');
        }
    }

    /**
     * Send transcript to appropriate transcript channel
     */
    private static async sendTranscriptToChannel(interaction: ButtonInteraction, ticket: any, transcriptBuffer: Buffer, closedBy: any): Promise<void> {
        try {
            const game = ticket.game || 'unknown';
            const type = ticket.type || 'regular';
            
            // Get transcript channel ID
            const gamePrefix = game.toUpperCase();
            const typePrefix = type.toUpperCase();
            const transcriptChannelId = process.env[`${gamePrefix}_${typePrefix}_TRANSCRIPT_CHANNEL_ID`];
            
            if (!transcriptChannelId) {
                console.warn(`No transcript channel configured for ${game} ${type} tickets`);
                return;
            }

            const guild = interaction.guild;
            if (!guild) return;

            const transcriptChannel = await guild.channels.fetch(transcriptChannelId);
            if (!transcriptChannel?.isTextBased()) {
                console.error(`Transcript channel not found or not text-based: ${transcriptChannelId}`);
                return;
            }

            // Create embed for transcript post
            const transcriptEmbed = new EmbedBuilder()
                .setTitle(`📄 Ticket Transcript #${ticket.ticket_number}`)
                .setColor(type === 'paid' ? 0x00d4aa : 0x5865f2)
                .addFields([
                    { name: '🎫 Ticket', value: `#${ticket.ticket_number}`, inline: true },
                    { name: '👤 Requester', value: `<@${ticket.user_id}>`, inline: true },
                    { name: '🎮 Game', value: game.toUpperCase(), inline: true },
                    { name: '🎯 Gamemode', value: ticket.gamemode || 'Not specified', inline: true },
                    { name: '📝 Type', value: type === 'paid' ? 'Paid Help' : 'Regular Help', inline: true },
                    { name: '🔒 Closed by', value: `<@${closedBy.id}>`, inline: true }
                ])
                .setTimestamp();

            if (ticket.claimed_by) {
                transcriptEmbed.addFields([
                    { name: '🤝 Helper', value: `<@${ticket.claimed_by}>`, inline: true }
                ]);
            }

            await transcriptChannel.send({
                embeds: [transcriptEmbed],
                files: [{ attachment: transcriptBuffer, name: `ticket-${ticket.ticket_number}-transcript.txt` }]
            });

            console.log(` Transcript sent to channel for ticket #${ticket.ticket_number}`);

        } catch (error) {
            console.error('Error sending transcript to channel:', error);
        }
    }

    /**
     * Show review system to ticket creator
     */
    private static async showReviewSystem(interaction: ButtonInteraction, ticket: any): Promise<void> {
        try {
            // Create review buttons (1-5 stars)
            const reviewButtons: ButtonBuilder[] = [];
            for (let i = 1; i <= 5; i++) {
                reviewButtons.push(
                    new ButtonBuilder()
                        .setCustomId(`close_review_${i}_${ticket.ticket_number}_${ticket.claimed_by}_${ticket.type}`)
                        .setLabel(`${i} Star${i > 1 ? 's' : ''}`)
                        .setEmoji('⭐')
                        .setStyle(i <= 2 ? ButtonStyle.Danger : i <= 3 ? ButtonStyle.Secondary : ButtonStyle.Success)
                );
            }

            // Add skip review button
            reviewButtons.push(
                new ButtonBuilder()
                    .setCustomId(`close_skip_review_${ticket.ticket_number}`)
                    .setLabel('Skip Review')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⏭️')
            );

            // Split buttons into two rows if needed
            const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(reviewButtons.slice(0, 3));
            const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(reviewButtons.slice(3));

            const reviewEmbed = new EmbedBuilder()
                .setTitle('🌟 Rate Your Experience')
                .setDescription(`**How was your experience with <@${ticket.claimed_by}>?**\n\nYour feedback helps us improve our carry service and recognize great helpers!`)
                .setColor(0x00d4aa)
                .setFooter({ text: `Ticket #${ticket.ticket_number} • Rating System` })
                .setTimestamp();

            await interaction.followUp({
                content: `<@${ticket.user_id}>`,
                embeds: [reviewEmbed],
                components: [row1, row2]
            });

        } catch (error) {
            console.error('Error showing review system:', error);
            // If review system fails, finalize closure
            await this.finalizeTicketClosure(interaction, ticket);
        }
    }

    /**
     * Finalize ticket closure (send DM, delete channel)
     */
    private static async finalizeTicketClosure(interaction: ButtonInteraction, ticket: any, transcriptBuffer?: Buffer): Promise<void> {
        try {
            // Send confirmation DM to ticket creator
            await this.sendClosureConfirmationDM(interaction, ticket, transcriptBuffer);

            // Delete the channel after delay
            setTimeout(async () => {
                try {
                    const channel = interaction.channel;
                    if (channel && 'delete' in channel) {
                        await (channel as any).delete(`Ticket #${ticket.ticket_number} closed and processed`);
                        console.log(` Ticket channel deleted for ticket #${ticket.ticket_number}`);
                    }
                } catch (deleteError) {
                    console.error(` Error deleting ticket channel for ticket #${ticket.ticket_number}:`, deleteError);
                }
            }, 10000); // 10 second delay

        } catch (error) {
            console.error('Error finalizing ticket closure:', error);
        }
    }

    /**
     * Send closure confirmation DM to ticket creator
     */
    private static async sendClosureConfirmationDM(interaction: ButtonInteraction, ticket: any, transcriptBuffer?: Buffer): Promise<void> {
        try {
            const ticketOpener = await interaction.client.users.fetch(ticket.user_id);

            const dmEmbed = new EmbedBuilder()
                .setTitle(`✅ Carry Request #${ticket.ticket_number} Completed`)
                .setDescription('Your carry request has been completed successfully!')
                .setColor(0x00ff00)
                .addFields([
                    { name: '🎫 Ticket ID', value: `#${ticket.ticket_number}`, inline: true },
                    { name: '🎮 Game', value: ticket.game?.toUpperCase() || 'Unknown', inline: true },
                    { name: '🎯 Gamemode', value: ticket.gamemode || 'Not specified', inline: true },
                    { name: '📝 Goal', value: ticket.goal || 'Not specified', inline: false }
                ])
                .setFooter({ text: 'Thank you for using our carry service!' })
                .setTimestamp();

            if (ticket.claimed_by) {
                dmEmbed.addFields({
                    name: "🤝 **Helped by**",
                    value: `${ticket.claimed_by_tag}`,
                    inline: false
                });
            }

            const dmData: any = { embeds: [dmEmbed] };
            
            if (transcriptBuffer) {
                dmData.files = [{ attachment: transcriptBuffer, name: `ticket-${ticket.ticket_number}-transcript.txt` }];
            }

            await ticketOpener.send(dmData);
            console.log(` Confirmation DM sent to user ${ticket.user_tag}`);

        } catch (dmError) {
            console.warn(` Could not send confirmation DM to user ${ticket.user_tag}:`, dmError);
        }
    }

    private static async handleError(interaction: ButtonInteraction, error: any): Promise<void> {
        console.error('Request carry button handler error:', error);
        
        try {
            const errorMessage = "An error occurred while processing your request. Please try again.";
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await safeReply(interaction, { content: errorMessage, ephemeral: true });
            }
        } catch (followUpError) {
            console.error('Failed to send error message:', followUpError);
        }
    }
}