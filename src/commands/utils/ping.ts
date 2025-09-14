import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction, Message } from 'discord.js';
import type { ColorResolvable } from 'discord.js';

interface LatencyStatus {
    emoji: string;
    status: string;
    color: ColorResolvable;
}

interface PingMetrics {
    roundTripLatency: number;
    websocketLatency: number;
    uptime: string;
    memoryUsage: NodeJS.MemoryUsage;
    nodeVersion: string;
    discordJsVersion: string;
    platform: string;
    architecture: string;
    guildCount: number;
    userCount: number;
}

const data = new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check the bot's latency, response time and additional metrics");

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        await interaction.reply({ content: "Pinging..." });
        const sent = await interaction.fetchReply() as Message;
        
        const metrics = await calculateMetrics(interaction, sent);
        const embed = createPingEmbed(metrics, interaction);
        const row = createButtonRow();

        await interaction.editReply({
            content: null,
            embeds: [embed],
            components: [row],
        });

        setupButtonCollector(interaction, row);
    } catch (error) {
        console.error("Error in ping command:", error);
        await handlePingError(interaction, error);
    }
}

async function calculateMetrics(interaction: ChatInputCommandInteraction, sent: Message): Promise<PingMetrics> {
    const roundTripLatency = sent.createdTimestamp - interaction.createdTimestamp;
    const websocketLatency = Math.round(interaction.client.ws.ping);
    const uptime = formatUptime(interaction.client.uptime || 0);
    const memoryUsage = process.memoryUsage();
    const nodeVersion = process.version;
    const discordJsVersion = require('discord.js').version;
    const platform = process.platform;
    const architecture = process.arch;
    const guildCount = interaction.client.guilds.cache.size;
    const userCount = interaction.client.users.cache.size;

    return {
        roundTripLatency,
        websocketLatency,
        uptime,
        memoryUsage,
        nodeVersion,
        discordJsVersion,
        platform,
        architecture,
        guildCount,
        userCount
    };
}

function getLatencyStatus(latency: number): LatencyStatus {
    if (latency < 100) {
        return { emoji: "🟢", status: "Excellent", color: "#00ff00" };
    } else if (latency < 200) {
        return { emoji: "🟡", status: "Good", color: "#ffff00" };
    } else if (latency < 300) {
        return { emoji: "🟠", status: "Fair", color: "#ff8000" };
    } else {
        return { emoji: "🔴", status: "Poor", color: "#ff0000" };
    }
}

function createPingEmbed(metrics: PingMetrics, interaction: ChatInputCommandInteraction): EmbedBuilder {
    const rtStatus = getLatencyStatus(metrics.roundTripLatency);
    const wsStatus = getLatencyStatus(metrics.websocketLatency);
    const memoryMB = Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024);
    const totalMemoryMB = Math.round(metrics.memoryUsage.heapTotal / 1024 / 1024);
    const memoryPercentage = Math.round((metrics.memoryUsage.heapUsed / metrics.memoryUsage.heapTotal) * 100);

    const embed = new EmbedBuilder()
        .setTitle("🏓 Bot Status & Performance")
        .setDescription("**Latency & Response Metrics**")
        .setColor(rtStatus.color)
        .addFields(
            {
                name: `${rtStatus.emoji} Round Trip Latency`,
                value: `\`${metrics.roundTripLatency}ms\` - ${rtStatus.status}`,
                inline: true
            },
            {
                name: `${wsStatus.emoji} WebSocket Latency`,
                value: `\`${metrics.websocketLatency}ms\` - ${wsStatus.status}`,
                inline: true
            },
            {
                name: "⏱️ Uptime",
                value: `\`${metrics.uptime}\``,
                inline: true
            },
            {
                name: "🖥️ System Information",
                value: [
                    `**Platform:** ${getPlatformName(metrics.platform)} (${metrics.architecture})`,
                    `**Node.js:** ${metrics.nodeVersion}`,
                    `**Discord.js:** v${metrics.discordJsVersion}`
                ].join('\n'),
                inline: true
            },
            {
                name: "📊 Memory Usage",
                value: [
                    `**Used:** ${memoryMB}MB / ${totalMemoryMB}MB`,
                    `**Usage:** ${memoryPercentage}%`,
                    `**RSS:** ${Math.round(metrics.memoryUsage.rss / 1024 / 1024)}MB`
                ].join('\n'),
                inline: true
            },
            {
                name: "📈 Bot Statistics",
                value: [
                    `**Servers:** ${metrics.guildCount.toLocaleString()}`,
                    `**Cached Users:** ${metrics.userCount.toLocaleString()}`,
                    `**Shard ID:** ${interaction.guild?.shardId ?? 0}`
                ].join('\n'),
                inline: true
            }
        )
        .setFooter({ 
            text: `Created by SirNotEthan • Requested by ${interaction.user.username}`,
            iconURL: interaction.user.displayAvatarURL()
        })
        .setTimestamp();

    return embed;
}

function createButtonRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('ping_refresh')
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Primary)
    );
}

function setupButtonCollector(interaction: ChatInputCommandInteraction, row: ActionRowBuilder<ButtonBuilder>): void {
    const collector = interaction.channel?.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000
    });

    collector?.on('collect', async (buttonInteraction: ButtonInteraction) => {
        if (buttonInteraction.user.id !== interaction.user.id) {
            await buttonInteraction.reply({
                content: "❌ You can only refresh your own ping command!",
                ephemeral: true
            });
            return;
        }

        if (buttonInteraction.customId === 'ping_refresh') {
            await buttonInteraction.deferUpdate();
            
            try {
                const newMetrics = await calculateRefreshMetrics(buttonInteraction);
                const newEmbed = createRefreshEmbed(newMetrics, interaction);

                await buttonInteraction.editReply({
                    embeds: [newEmbed],
                    components: [row]
                });
            } catch (error) {
                console.error("Error refreshing ping:", error);
                await buttonInteraction.followUp({
                    content: "❌ Failed to refresh ping metrics.",
                    ephemeral: true
                });
            }
        }
    });

    collector?.on('end', async () => {
        try {
            const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('ping_refresh')
                    .setLabel('🔄 Refresh (Expired)')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );

            await interaction.editReply({ components: [disabledRow] });
        } catch (error) {
            console.error("Error disabling ping button:", error);
        }
    });
}

async function calculateRefreshMetrics(buttonInteraction: ButtonInteraction): Promise<PingMetrics> {
    const start = Date.now();
    await buttonInteraction.deferUpdate();
    const roundTripLatency = Date.now() - start;
    const websocketLatency = Math.round(buttonInteraction.client.ws.ping);
    const uptime = formatUptime(buttonInteraction.client.uptime || 0);
    const memoryUsage = process.memoryUsage();
    const nodeVersion = process.version;
    const discordJsVersion = require('discord.js').version;
    const platform = process.platform;
    const architecture = process.arch;
    const guildCount = buttonInteraction.client.guilds.cache.size;
    const userCount = buttonInteraction.client.users.cache.size;

    return {
        roundTripLatency,
        websocketLatency,
        uptime,
        memoryUsage,
        nodeVersion,
        discordJsVersion,
        platform,
        architecture,
        guildCount,
        userCount
    };
}

function createRefreshEmbed(metrics: PingMetrics, originalInteraction: ChatInputCommandInteraction): EmbedBuilder {
    const rtStatus = getLatencyStatus(metrics.roundTripLatency);
    const wsStatus = getLatencyStatus(metrics.websocketLatency);
    const memoryMB = Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024);
    const totalMemoryMB = Math.round(metrics.memoryUsage.heapTotal / 1024 / 1024);
    const memoryPercentage = Math.round((metrics.memoryUsage.heapUsed / metrics.memoryUsage.heapTotal) * 100);

    return new EmbedBuilder()
        .setTitle("🏓 Bot Status & Performance (Refreshed)")
        .setDescription("**Latency & Response Metrics**")
        .setColor(rtStatus.color)
        .addFields(
            {
                name: `${rtStatus.emoji} Round Trip Latency`,
                value: `\`${metrics.roundTripLatency}ms\` - ${rtStatus.status}`,
                inline: true
            },
            {
                name: `${wsStatus.emoji} WebSocket Latency`,
                value: `\`${metrics.websocketLatency}ms\` - ${wsStatus.status}`,
                inline: true
            },
            {
                name: "⏱️ Uptime",
                value: `\`${metrics.uptime}\``,
                inline: true
            },
            {
                name: "🖥️ System Information",
                value: [
                    `**Platform:** ${getPlatformName(metrics.platform)} (${metrics.architecture})`,
                    `**Node.js:** ${metrics.nodeVersion}`,
                    `**Discord.js:** v${metrics.discordJsVersion}`
                ].join('\n'),
                inline: true
            },
            {
                name: "📊 Memory Usage",
                value: [
                    `**Used:** ${memoryMB}MB / ${totalMemoryMB}MB`,
                    `**Usage:** ${memoryPercentage}%`,
                    `**RSS:** ${Math.round(metrics.memoryUsage.rss / 1024 / 1024)}MB`
                ].join('\n'),
                inline: true
            },
            {
                name: "📈 Bot Statistics",
                value: [
                    `**Servers:** ${metrics.guildCount.toLocaleString()}`,
                    `**Cached Users:** ${metrics.userCount.toLocaleString()}`,
                    `**Shard ID:** ${originalInteraction.guild?.shardId ?? 0}`
                ].join('\n'),
                inline: true
            }
        )
        .setFooter({ 
            text: `Created by SirNotEthan • Requested by ${originalInteraction.user.username}`,
            iconURL: originalInteraction.user.displayAvatarURL()
        })
        .setTimestamp();
}

async function handlePingError(interaction: ChatInputCommandInteraction, error: any): Promise<void> {
    console.error("Ping command error:", error);
    
    try {
        const errorMessage = "❌ Failed to execute ping command. Please try again later.";
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    } catch (followUpError) {
        console.error("Failed to send ping error message:", followUpError);
    }
}

function formatUptime(uptime: number): string {
    const seconds = Math.floor((uptime / 1000) % 60);
    const minutes = Math.floor((uptime / (1000 * 60)) % 60);
    const hours = Math.floor((uptime / (1000 * 60 * 60)) % 24);
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.length > 0 ? parts.join(' ') : '0s';
}

function getPlatformName(platform: string): string {
    switch (platform) {
        case 'win32': return 'Windows';
        case 'darwin': return 'macOS';
        case 'linux': return 'Linux';
        case 'freebsd': return 'FreeBSD';
        case 'openbsd': return 'OpenBSD';
        case 'sunos': return 'SunOS';
        case 'aix': return 'AIX';
        default: return platform.charAt(0).toUpperCase() + platform.slice(1);
    }
}

export default { data, execute };