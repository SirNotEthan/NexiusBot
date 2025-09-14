import { Client, EmbedBuilder, TextChannel, ColorResolvable } from 'discord.js';

export enum LogLevel {
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
    SUCCESS = 'SUCCESS',
    DEBUG = 'DEBUG'
}

export interface LogEntry {
    level: LogLevel;
    title: string;
    description: string;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp?: Date;
    userId?: string;
    guildId?: string;
    channelId?: string;
    commandName?: string;
    error?: Error;
}

class BotLogger {
    private client: Client | null = null;
    private logsChannelId: string | null = null;

    initialize(client: Client) {
        this.client = client;
        this.logsChannelId = process.env.BOT_LOGS_CHANNEL_ID || null;
    }

    private getColor(level: LogLevel): ColorResolvable {
        switch (level) {
            case LogLevel.SUCCESS:
                return 0x00ff00; // Green
            case LogLevel.INFO:
                return 0x0099ff; // Blue
            case LogLevel.WARN:
                return 0xff9900; // Orange
            case LogLevel.ERROR:
                return 0xff0000; // Red
            case LogLevel.DEBUG:
                return 0x9900ff; // Purple
            default:
                return 0x808080; // Gray
        }
    }

    private getEmoji(level: LogLevel): string {
        switch (level) {
            case LogLevel.SUCCESS:
                return '✅';
            case LogLevel.INFO:
                return 'ℹ️';
            case LogLevel.WARN:
                return '⚠️';
            case LogLevel.ERROR:
                return '❌';
            case LogLevel.DEBUG:
                return '🐛';
            default:
                return '📝';
        }
    }

    private formatTimestamp(date: Date): string {
        return `<t:${Math.floor(date.getTime() / 1000)}:f>`;
    }

    async log(entry: LogEntry): Promise<void> {
        const timestamp = entry.timestamp || new Date();
        const emoji = this.getEmoji(entry.level);
        
        const consoleMessage = `[${timestamp.toISOString()}] [${entry.level}] ${entry.title}: ${entry.description}`;
        
        switch (entry.level) {
            case LogLevel.ERROR:
                console.error(consoleMessage);
                if (entry.error) {
                    console.error(entry.error);
                }
                break;
            case LogLevel.WARN:
                console.warn(consoleMessage);
                break;
            case LogLevel.SUCCESS:
            case LogLevel.INFO:
            case LogLevel.DEBUG:
            default:
                console.log(consoleMessage);
                break;
        }

        if (!this.client || !this.logsChannelId) {
            return;
        }

        try {
            const channel = await this.client.channels.fetch(this.logsChannelId) as TextChannel;
            if (!channel) {
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle(`${emoji} ${entry.title}`)
                .setDescription(entry.description)
                .setColor(this.getColor(entry.level))
                .setTimestamp(timestamp);

            if (entry.fields && entry.fields.length > 0) {
                embed.addFields(entry.fields);
            }

            const contextFields = [];
            
            if (entry.userId) {
                contextFields.push({
                    name: '👤 User',
                    value: `<@${entry.userId}>`,
                    inline: true
                });
            }

            if (entry.guildId) {
                contextFields.push({
                    name: '🏠 Guild',
                    value: entry.guildId,
                    inline: true
                });
            }

            if (entry.channelId) {
                contextFields.push({
                    name: '📺 Channel',
                    value: `<#${entry.channelId}>`,
                    inline: true
                });
            }

            if (entry.commandName) {
                contextFields.push({
                    name: '⚡ Command',
                    value: `\`/${entry.commandName}\``,
                    inline: true
                });
            }

            if (contextFields.length > 0) {
                embed.addFields(contextFields);
            }

            if (entry.error) {
                embed.addFields([
                    {
                        name: '🐛 Error Details',
                        value: `\`\`\`${entry.error.message}\`\`\``,
                        inline: false
                    },
                    {
                        name: '📋 Stack Trace',
                        value: `\`\`\`${entry.error.stack?.slice(0, 1000) || 'No stack trace'}\`\`\``,
                        inline: false
                    }
                ]);
            }

            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to send log to Discord channel:', error);
        }
    }

    async info(title: string, description: string, options?: Partial<LogEntry>): Promise<void> {
        await this.log({
            level: LogLevel.INFO,
            title,
            description,
            ...options
        });
    }

    async success(title: string, description: string, options?: Partial<LogEntry>): Promise<void> {
        await this.log({
            level: LogLevel.SUCCESS,
            title,
            description,
            ...options
        });
    }

    async warn(title: string, description: string, options?: Partial<LogEntry>): Promise<void> {
        await this.log({
            level: LogLevel.WARN,
            title,
            description,
            ...options
        });
    }

    async error(title: string, description: string, error?: Error, options?: Partial<LogEntry>): Promise<void> {
        await this.log({
            level: LogLevel.ERROR,
            title,
            description,
            error,
            ...options
        });
    }

    async debug(title: string, description: string, options?: Partial<LogEntry>): Promise<void> {
        await this.log({
            level: LogLevel.DEBUG,
            title,
            description,
            ...options
        });
    }

    async logCommand(
        commandName: string,
        userId: string,
        guildId?: string,
        channelId?: string,
        options?: string,
        executionTime?: number
    ): Promise<void> {
        const description = `Command executed${executionTime ? ` in ${executionTime}ms` : ''}`;
        const fields = [];
        
        if (options) {
            fields.push({
                name: '⚙️ Options',
                value: options,
                inline: false
            });
        }

        await this.info('Command Executed', description, {
            commandName,
            userId,
            guildId,
            channelId,
            fields: fields.length > 0 ? fields : undefined
        });
    }

    async logInteraction(
        interactionType: string,
        customId: string,
        userId: string,
        guildId?: string,
        channelId?: string
    ): Promise<void> {
        await this.info('Interaction Handled', `${interactionType} interaction processed`, {
            userId,
            guildId,
            channelId,
            fields: [
                {
                    name: '🔧 Interaction Type',
                    value: interactionType,
                    inline: true
                },
                {
                    name: '🆔 Custom ID',
                    value: `\`${customId}\``,
                    inline: true
                }
            ]
        });
    }

    async logBotStart(): Promise<void> {
        await this.success('Bot Started', 'VouchBot has successfully initialized and is ready to serve!', {
            fields: [
                {
                    name: '🤖 Bot Version',
                    value: process.env.npm_package_version || 'Unknown',
                    inline: true
                },
                {
                    name: '📊 Node.js Version',
                    value: process.version,
                    inline: true
                },
                {
                    name: '🚀 Start Time',
                    value: this.formatTimestamp(new Date()),
                    inline: true
                }
            ]
        });
    }

    async logBotShutdown(): Promise<void> {
        await this.warn('Bot Shutting Down', 'VouchBot is shutting down gracefully...');
    }

    async logDatabaseQuery(query: string, executionTime?: number, error?: Error): Promise<void> {
        if (error) {
            await this.error('Database Query Failed', `Query execution failed${executionTime ? ` after ${executionTime}ms` : ''}`, error, {
                fields: [
                    {
                        name: '🗃️ Query',
                        value: `\`\`\`sql\n${query.slice(0, 500)}${query.length > 500 ? '...' : ''}\`\`\``,
                        inline: false
                    }
                ]
            });
        } else if (executionTime && executionTime > 1000) { // Log slow queries
            await this.warn('Slow Database Query', `Query took ${executionTime}ms to execute`, {
                fields: [
                    {
                        name: '🗃️ Query',
                        value: `\`\`\`sql\n${query.slice(0, 500)}${query.length > 500 ? '...' : ''}\`\`\``,
                        inline: false
                    }
                ]
            });
        }
    }

    async logTicketCreated(ticketNumber: string, userId: string, ticketType: string, game: string): Promise<void> {
        await this.info('Ticket Created', `New ${ticketType} ticket created`, {
            userId,
            fields: [
                {
                    name: '🎫 Ticket Number',
                    value: `#${ticketNumber}`,
                    inline: true
                },
                {
                    name: '🎮 Game',
                    value: game.toUpperCase(),
                    inline: true
                },
                {
                    name: '💳 Type',
                    value: ticketType === 'paid' ? 'Paid Help' : 'Regular Help',
                    inline: true
                }
            ]
        });
    }

    async logTicketClaimed(ticketNumber: string, helperId: string, userId: string): Promise<void> {
        await this.info('Ticket Claimed', `Ticket has been claimed by a helper`, {
            userId,
            fields: [
                {
                    name: '🎫 Ticket Number',
                    value: `#${ticketNumber}`,
                    inline: true
                },
                {
                    name: '👨‍💼 Helper',
                    value: `<@${helperId}>`,
                    inline: true
                }
            ]
        });
    }

    async logTicketClosed(ticketNumber: string, reason: string, userId?: string): Promise<void> {
        await this.info('Ticket Closed', `Ticket has been closed`, {
            userId,
            fields: [
                {
                    name: '🎫 Ticket Number',
                    value: `#${ticketNumber}`,
                    inline: true
                },
                {
                    name: '📝 Reason',
                    value: reason,
                    inline: true
                }
            ]
        });
    }

    async logVouchCreated(ticketNumber: string, helperId: string, userId: string, rating: number, reason: string): Promise<void> {
        await this.success('Vouch Created', `New vouch submitted for helper`, {
            userId,
            fields: [
                {
                    name: '🎫 Ticket Number',
                    value: `#${ticketNumber}`,
                    inline: true
                },
                {
                    name: '👨‍💼 Helper',
                    value: `<@${helperId}>`,
                    inline: true
                },
                {
                    name: '⭐ Rating',
                    value: `${rating}/5 ⭐`,
                    inline: true
                },
                {
                    name: '💬 Feedback',
                    value: reason.slice(0, 200) + (reason.length > 200 ? '...' : ''),
                    inline: false
                }
            ]
        });
    }

    async logInteractionFailure(
        interactionType: string,
        customId: string,
        userId: string,
        error: Error,
        guildId?: string,
        channelId?: string,
        additionalContext?: string
    ): Promise<void> {
        const isExpiredInteraction = error.message.includes('10062') || error.message.includes('Unknown interaction');
        const level = isExpiredInteraction ? LogLevel.WARN : LogLevel.ERROR;
        const title = isExpiredInteraction ? 'Interaction Expired' : 'Interaction Failed';
        
        await this.log({
            level,
            title,
            description: `${interactionType} interaction failed to execute`,
            error,
            userId,
            guildId,
            channelId,
            fields: [
                {
                    name: '🔧 Interaction Type',
                    value: interactionType,
                    inline: true
                },
                {
                    name: '🆔 Custom ID',
                    value: `\`${customId || 'Unknown'}\``,
                    inline: true
                },
                {
                    name: '📊 Error Code',
                    value: (error as any).code ? `\`${(error as any).code}\`` : 'No error code',
                    inline: true
                },
                ...(additionalContext ? [{
                    name: '📝 Additional Context',
                    value: additionalContext,
                    inline: false
                }] : [])
            ]
        });
    }

    async logInteractionTimeout(
        interactionType: string,
        customId: string,
        userId: string,
        age: number,
        guildId?: string,
        channelId?: string
    ): Promise<void> {
        await this.warn('Interaction Timeout', `${interactionType} interaction was too old to process`, {
            userId,
            guildId,
            channelId,
            fields: [
                {
                    name: '🔧 Interaction Type',
                    value: interactionType,
                    inline: true
                },
                {
                    name: '🆔 Custom ID',
                    value: `\`${customId || 'Unknown'}\``,
                    inline: true
                },
                {
                    name: '⏰ Age',
                    value: `${Math.floor(age / 1000 / 60)} minutes`,
                    inline: true
                }
            ]
        });
    }

    async logInteractionValidation(
        interactionType: string,
        customId: string,
        userId: string,
        validationError: string,
        guildId?: string,
        channelId?: string
    ): Promise<void> {
        await this.warn('Interaction Validation Failed', `${interactionType} interaction failed validation`, {
            userId,
            guildId,
            channelId,
            fields: [
                {
                    name: '🔧 Interaction Type',
                    value: interactionType,
                    inline: true
                },
                {
                    name: '🆔 Custom ID',
                    value: `\`${customId || 'Unknown'}\``,
                    inline: true
                },
                {
                    name: '❌ Validation Error',
                    value: validationError,
                    inline: false
                }
            ]
        });
    }

    async logSafeInteractionResult(
        operation: string,
        success: boolean,
        interactionType: string,
        userId: string,
        reason?: string
    ): Promise<void> {
        if (success) return;
        
        await this.debug('Safe Interaction Failed', `Safe ${operation} operation failed`, {
            userId,
            fields: [
                {
                    name: '🔧 Operation',
                    value: operation,
                    inline: true
                },
                {
                    name: '🔧 Interaction Type',
                    value: interactionType,
                    inline: true
                },
                {
                    name: '❌ Reason',
                    value: reason || 'Unknown reason',
                    inline: false
                }
            ]
        });
    }
}

export const botLogger = new BotLogger();
export default botLogger;