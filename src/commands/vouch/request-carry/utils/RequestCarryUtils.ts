import { Guild, ChannelType, PermissionFlagsBits, ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder, ContainerBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { RequestCarryData } from '../builders/RequestCarryBuilder';
import Database from '../../../../database/database';
import { botLogger } from '../../../../utils/logger';

function getGameDisplayName(gameCode: string): string {
    const gameNames: { [key: string]: string } = {
        'als': 'Anime Last Stand',
        'av': 'Anime Vanguards',
        'ac': 'Anime Crusaders'
    };
    return gameNames[gameCode] || gameCode.toUpperCase();
}

export class RequestCarryUtils {
    static isFormComplete(data: RequestCarryData): boolean {
        return !!(
            data.game && 
            data.gamemode && 
            data.goal && 
            data.canJoinLinks !== undefined
        );
    }

    static async createTicket(
        guild: Guild,
        data: RequestCarryData,
        userId: string,
        userTag: string
    ): Promise<string> {
        const db = new Database();
        await db.connect();
        
        try {
            const categoryId = this.getGameCategoryId(data.game!, data.type);
            if (!categoryId) {
                const envVar = `${data.game!.toUpperCase()}_${data.type.toUpperCase()}_CATEGORY_ID`;
                throw new Error(`${data.type} tickets category ID for ${getGameDisplayName(data.game!)} not configured. Missing environment variable: ${envVar}`);
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

            const gameHelperRoleId = this.getGameHelperRoleId(data.game!);
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

            if (data.type === 'paid' && data.selectedHelper) {
                permissionOverwrites.push({
                    id: data.selectedHelper,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageMessages,
                        PermissionFlagsBits.UseApplicationCommands
                    ],
                });
            }

            const tempChannelName = `${data.type}-${data.game}-temp-${Date.now()}`;

            const ticketChannel = await guild.channels.create({
                name: tempChannelName,
                type: ChannelType.GuildText,
                parent: categoryId,
                permissionOverwrites,
            });

            try {
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

                const finalChannelName = `${data.type}-${ticketResult.ticketNumber}`;
                await ticketChannel.setName(finalChannelName);

                await botLogger.logTicketCreated(ticketResult.ticketNumber, userId, data.type, data.game!);

                await this.sendTicketMessage(ticketChannel, data, parseInt(ticketResult.ticketNumber), userId);

                return ticketChannel.id;

            } catch (ticketError) {
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

    private static async sendTicketMessage(
        channel: any,
        data: RequestCarryData,
        ticketNumber: number,
        userId: string
    ): Promise<void> {
        const ticketContainer = new ContainerBuilder();

        if (!(ticketContainer as any).components) {
            (ticketContainer as any).components = [];
        }

        const headerSection = new TextDisplayBuilder()
            .setContent(`# 🎫 Ticket Created\n\n<@${userId}> - Your ticket has been created!`);
        (ticketContainer as any).components.push(headerSection);

        const typeSection = new TextDisplayBuilder()
            .setContent(`**Type:** ${data.type === 'paid' ? 'Paid Help' : 'Regular Help'}`);
        (ticketContainer as any).components.push(typeSection);

        const gameSection = new TextDisplayBuilder()
            .setContent(`**Game:** \n \`\`\`${getGameDisplayName(data.game!)}\`\`\` `);
        (ticketContainer as any).components.push(gameSection);

        const gamemodeSection = new TextDisplayBuilder()
            .setContent(`**Gamemode:** \n \`\`\`${this.capitalizeFirstLetter(data.gamemode || '')}\`\`\``);
        (ticketContainer as any).components.push(gamemodeSection);

        const linksSection = new TextDisplayBuilder()
            .setContent(`**Can Join Links:** \n \`\`\`${data.canJoinLinks ? 'Yes' : 'No'}\`\`\` `);
        (ticketContainer as any).components.push(linksSection);

        const goalSection = new TextDisplayBuilder()
            .setContent(`**Goal:** \n \`\`\`${data.goal}\`\`\` `);
        (ticketContainer as any).components.push(goalSection);

        await channel.send({
            components: [ticketContainer],
            flags: MessageFlags.IsComponentsV2
        });

        const controlButtons = this.createTicketControlButtons(ticketNumber, data.type === 'paid' && data.selectedHelper ? 'claimed' : 'open');
        const controlContainer = new ContainerBuilder();
        
        if (!(controlContainer as any).components) {
            (controlContainer as any).components = [];
        }

        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(controlButtons);
        (controlContainer as any).components.push(buttonRow);

        await channel.send({
            components: [controlContainer],
            flags: MessageFlags.IsComponentsV2
        });

        const gameHelperRoleId = this.getGameHelperRoleId(data.game!);
        if (gameHelperRoleId) {
            const pingMessage = await channel.send(`<@&${gameHelperRoleId}> - New ${data.type} ${getGameDisplayName(data.game!)} carry request!`);
            await pingMessage.delete();
        }
    }

    private static getGameCategoryId(game: string, type: 'regular' | 'paid'): string | undefined {
        const gamePrefix = game.toUpperCase();
        const typePrefix = type.toUpperCase();
        const envVar = `${gamePrefix}_${typePrefix}_CATEGORY_ID`;
        
        return process.env[envVar];
    }

    private static getGameHelperRoleId(game: string): string | undefined {
        const gamePrefix = game.toUpperCase();
        const envVar = `${gamePrefix}_HELPER_ROLE_ID`;
        
        return process.env[envVar];
    }

    static createTicketControlButtons(ticketNumber: number, status: 'open' | 'claimed' | 'closed'): ButtonBuilder[] {
        console.log(`[BUTTON_CREATE_DEBUG] Creating buttons for ticket #${ticketNumber} with status: ${status}`);
        const buttons: ButtonBuilder[] = [];

        if (status === 'open') {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`ticket_claim_${ticketNumber}`)
                    .setLabel('Claim Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎫'),
                new ButtonBuilder()
                    .setCustomId(`ring_helper_${ticketNumber}`)
                    .setLabel('Ring Helper')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📞')
            );
            console.log(`[BUTTON_CREATE_DEBUG] Added Claim Ticket and Ring Helper buttons`);
        } else if (status === 'claimed') {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`ring_helper_${ticketNumber}`)
                    .setLabel('Ring Helper')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📞'),
                new ButtonBuilder()
                    .setCustomId(`ticket_unclaim_${ticketNumber}`)
                    .setLabel('Unclaim Ticket')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🎫')
            );
            console.log(`[BUTTON_CREATE_DEBUG] Added Ring Helper and Unclaim Ticket buttons`);
        }

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

    static validateRequestData(data: RequestCarryData): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!data.game) {
            errors.push('Game is required');
        } else if (!['als', 'av', 'ac'].includes(data.game)) {
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

    static formatValidationErrors(errors: string[]): string {
        return `❌ **Please fix the following issues:**\n\n${errors.map(error => `• ${error}`).join('\n')}`;
    }

    static capitalizeFirstLetter(str: string): string {
        if (!str) return str;
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}