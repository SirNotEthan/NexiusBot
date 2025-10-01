import { Guild, ChannelType, PermissionFlagsBits, ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder, ContainerBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { RequestCarryData } from '../builders/RequestCarryBuilder';
import Database from '../../../../database/database';
import { botLogger } from '../../../../utils/logger';

/**
 * Get display name for game code
 */
function getGameDisplayName(gameCode: string): string {
    const gameNames: { [key: string]: string } = {
        'als': 'Anime Last Stand',
        'av': 'Anime Vanguards'
    };
    return gameNames[gameCode] || gameCode.toUpperCase();
}

/**
 * Utility functions for request-carry command
 * Handles business logic, validation, and database operations
 */
export class RequestCarryUtils {

    /**
     * Check if form is complete and valid
     */
    static isFormComplete(data: RequestCarryData): boolean {
        return !!(
            data.game && 
            data.gamemode && 
            data.goal && 
            data.canJoinLinks !== undefined
        );
    }


    /**
     * Create a ticket for the carry request
     */
    static async createTicket(
        guild: Guild,
        data: RequestCarryData,
        userId: string,
        userTag: string
    ): Promise<string> {
        const db = new Database();
        await db.connect();
        
        try {
            // Get category ID for the ticket type and game
            const categoryId = this.getGameCategoryId(data.game!, data.type);
            if (!categoryId) {
                const envVar = `${data.game!.toUpperCase()}_${data.type.toUpperCase()}_CATEGORY_ID`;
                throw new Error(`${data.type} tickets category ID for ${getGameDisplayName(data.game!)} not configured. Missing environment variable: ${envVar}`);
            }

            // Set up permissions (we'll update channel name after getting ticket number)
            const permissionOverwrites = [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: userId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ],
                }
            ];

            // Add game helper role permissions
            const gameHelperRoleId = this.getGameHelperRoleId(data.game!);
            if (gameHelperRoleId) {
                permissionOverwrites.push({
                    id: gameHelperRoleId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ],
                });
            }

            // Add selected helper permissions for paid tickets
            if (data.type === 'paid' && data.selectedHelper) {
                permissionOverwrites.push({
                    id: data.selectedHelper,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageMessages
                    ],
                });
            }

            // Create temporary channel first, we'll rename it after getting ticket number
            const gameName = data.game === 'av' ? 'av' : data.game === 'als' ? 'als' : data.game!;
            const tempChannelName = `${data.type}-${gameName}-temp-${Date.now()}`;

            const ticketChannel = await guild.channels.create({
                name: tempChannelName,
                type: ChannelType.GuildText,
                parent: categoryId,
                permissionOverwrites,
            });

            try {
                // Create ticket record in database with atomic number generation
                const ticketResult = await db.createTicketWithAutoNumber({
                    user_id: userId,
                    user_tag: userTag,
                    channel_id: ticketChannel.id,
                    game: data.game!,
                    gamemode: data.gamemode!,
                    goal: data.goal!,
                    contact: data.canJoinLinks ? 'Can join links' : 'Cannot join links',
                    status: (data.type === 'paid' && data.selectedHelper) ? 'claimed' : 'open' as const,
                    type: data.type,
                    claimed_by: data.type === 'paid' ? data.selectedHelper : undefined,
                    claimed_by_tag: data.type === 'paid' && data.selectedHelper ? 'Selected Helper' : undefined
                });

                // Now rename the channel with the actual ticket number
                const finalChannelName = `${data.type}-${gameName}-${ticketResult.ticketNumber}`;
                await ticketChannel.setName(finalChannelName);

                // Log ticket creation
                await botLogger.logTicketCreated(ticketResult.ticketNumber, userId, data.type, data.game!);

                // Send initial message to ticket channel
                await this.sendTicketMessage(ticketChannel, data, parseInt(ticketResult.ticketNumber), userId);

                return ticketChannel.id;

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
            
        } finally {
            await db.close();
        }
    }

    /**
     * Send the initial message to the ticket channel
     */
    private static async sendTicketMessage(
        channel: any,
        data: RequestCarryData,
        ticketNumber: number,
        userId: string
    ): Promise<void> {
        // Create ticket information message using ContainerBuilder with SectionBuilder components
        const ticketContainer = new ContainerBuilder();
        
        // Initialize components array if it doesn't exist
        if (!(ticketContainer as any).components) {
            (ticketContainer as any).components = [];
        }

        // Add ticket header section
        const headerSection = new TextDisplayBuilder()
            .setContent(`# 🎫 Carry Request #${ticketNumber}`);
        (ticketContainer as any).components.push(headerSection);

        // Add requester section
        const requesterSection = new TextDisplayBuilder()
            .setContent(`**Requested by:** <@${userId}>`);
        (ticketContainer as any).components.push(requesterSection);

        // Add type section
        const typeSection = new TextDisplayBuilder()
            .setContent(`**Type:** ${data.type === 'paid' ? 'Paid Help' : 'Regular Help'}`);
        (ticketContainer as any).components.push(typeSection);

        // Add game section
        const gameSection = new TextDisplayBuilder()
            .setContent(`**Game:** \`\`${getGameDisplayName(data.game!)}\`\` `);
        (ticketContainer as any).components.push(gameSection);

        // Add gamemode section
        const gamemodeSection = new TextDisplayBuilder()
            .setContent(`**Gamemode:** \`\`${data.gamemode}\`\``);
        (ticketContainer as any).components.push(gamemodeSection);

        // Add links section
        const linksSection = new TextDisplayBuilder()
            .setContent(`**Can Join Links:** \`\`${data.canJoinLinks ? 'Yes' : 'No'}\`\` `);
        (ticketContainer as any).components.push(linksSection);

        // Add goal section
        const goalSection = new TextDisplayBuilder()
            .setContent(`**Goal:** \`\`${data.goal}\`\` `);
        (ticketContainer as any).components.push(goalSection);

        // Send the ticket information message using ContainerBuilder
        await channel.send({
            components: [ticketContainer],
            flags: MessageFlags.IsComponentsV2
        });

        // Create control buttons for helpers based on initial ticket status
        const controlButtons = this.createTicketControlButtons(ticketNumber, data.type === 'paid' && data.selectedHelper ? 'claimed' : 'open');

        // Create second container with control buttons
        const controlContainer = new ContainerBuilder();
        
        // Initialize components array if it doesn't exist
        if (!(controlContainer as any).components) {
            (controlContainer as any).components = [];
        }

        // Add button row to container (no text, just buttons)
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(controlButtons);
        (controlContainer as any).components.push(buttonRow);

        // Send the control panel
        await channel.send({
            components: [controlContainer],
            flags: MessageFlags.IsComponentsV2
        });

        // Ping appropriate helper roles
        const gameHelperRoleId = this.getGameHelperRoleId(data.game!);
        if (gameHelperRoleId) {
            await channel.send(`<@&${gameHelperRoleId}> - New ${data.type} ${getGameDisplayName(data.game!)} carry request!`);
        }
    }

    /**
     * Get category ID for game and ticket type
     * 
     * Required environment variables:
     * - ALS_REGULAR_CATEGORY_ID: Category for regular ALS tickets
     * - ALS_PAID_CATEGORY_ID: Category for paid ALS tickets  
     * - AV_REGULAR_CATEGORY_ID: Category for regular AV tickets
     * - AV_PAID_CATEGORY_ID: Category for paid AV tickets
     */
    private static getGameCategoryId(game: string, type: 'regular' | 'paid'): string | undefined {
        const gamePrefix = game.toUpperCase();
        const typePrefix = type.toUpperCase();
        const envVar = `${gamePrefix}_${typePrefix}_CATEGORY_ID`;
        
        return process.env[envVar];
    }

    /**
     * Get helper role ID for game
     * 
     * Required environment variables:
     * - ALS_HELPER_ROLE_ID: Role ID for ALS helpers
     * - AV_HELPER_ROLE_ID: Role ID for AV helpers
     */
    private static getGameHelperRoleId(game: string): string | undefined {
        const gamePrefix = game.toUpperCase();
        const envVar = `${gamePrefix}_HELPER_ROLE_ID`;
        
        return process.env[envVar];
    }

    /**
     * Create ticket control buttons based on ticket status
     */
    static createTicketControlButtons(ticketNumber: number, status: 'open' | 'claimed' | 'closed'): ButtonBuilder[] {
        console.log(`[BUTTON_CREATE_DEBUG] Creating buttons for ticket #${ticketNumber} with status: ${status}`);
        const buttons: ButtonBuilder[] = [];

        if (status === 'open') {
            // Show claim and close buttons for open tickets
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`ticket_claim_${ticketNumber}`)
                    .setLabel('Claim Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🤝')
            );
            console.log(`[BUTTON_CREATE_DEBUG] Added Claim Ticket button`);
        } else if (status === 'claimed') {
            // Show unclaim and close buttons for claimed tickets
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`ticket_unclaim_${ticketNumber}`)
                    .setLabel('Unclaim Ticket')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('❌')
            );
            console.log(`[BUTTON_CREATE_DEBUG] Added Unclaim Ticket button`);
        }

        // Always show close button unless ticket is already closed
        if (status !== 'closed') {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`ticket_close_${ticketNumber}`)
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
            );
            console.log(`[BUTTON_CREATE_DEBUG] Added Close Ticket button`);
        }

        console.log(`[BUTTON_CREATE_DEBUG] Created ${buttons.length} total buttons for status: ${status}`);
        return buttons;
    }

    /**
     * Validate request data
     */
    static validateRequestData(data: RequestCarryData): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!data.game) {
            errors.push('Game is required');
        } else if (!['als', 'av'].includes(data.game)) {
            errors.push('Invalid game selected');
        }

        if (!data.gamemode) {
            errors.push('Gamemode is required');
        }

        if (!data.goal) {
            errors.push('Goal is required');
        } else if (data.goal.length < 10) {
            errors.push('Goal must be at least 10 characters');
        } else if (data.goal.length > 500) {
            errors.push('Goal must be less than 500 characters');
        }

        if (data.canJoinLinks === undefined) {
            errors.push('Must specify if you can join links');
        }

        if (data.type === 'paid' && !data.selectedHelper) {
            errors.push('Paid tickets require a selected helper');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Format validation errors for user display
     */
    static formatValidationErrors(errors: string[]): string {
        return `❌ **Please fix the following issues:**\n\n${errors.map(error => `• ${error}`).join('\n')}`;
    }
}