import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    User
} from 'discord.js';
import Database from '../../database/database';

const data = new SlashCommandBuilder()
    .setName("manage-vouches")
    .setDescription("Staff command to manage vouches")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Manually add a vouch for a helper')
            .addUserOption(option =>
                option.setName('helper')
                    .setDescription('Helper to receive the vouch')
                    .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User giving the vouch')
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName('rating')
                    .setDescription('Rating (1-5 stars)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(5)
            )
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for the vouch')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('Type of vouch')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Regular', value: 'regular' },
                        { name: 'Paid', value: 'paid' }
                    )
            )
            .addIntegerOption(option =>
                option.setName('ticket-id')
                    .setDescription('Ticket ID (number only, e.g., 123)')
                    .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('compensation')
                    .setDescription('Compensation (for paid vouches)')
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove')
            .setDescription('Remove a vouch by ID')
            .addIntegerOption(option =>
                option.setName('vouch-id')
                    .setDescription('ID of the vouch to remove')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('List vouches for a helper')
            .addUserOption(option =>
                option.setName('helper')
                    .setDescription('Helper to view vouches for')
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName('limit')
                    .setDescription('Number of vouches to show (default: 10)')
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(25)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('view')
            .setDescription('View details of a specific vouch')
            .addIntegerOption(option =>
                option.setName('vouch-id')
                    .setDescription('ID of the vouch to view')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('search')
            .setDescription('Search for vouches by user who gave the vouch')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User who gave the vouch')
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName('limit')
                    .setDescription('Number of vouches to show (default: 10)')
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(25)
            )
    );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        if (!interaction.member || !interaction.guild) {
            await interaction.reply({
                content: "❌ This command can only be used in a server!",
                ephemeral: true
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'add':
                await handleAddVouch(interaction);
                break;
            case 'remove':
                await handleRemoveVouch(interaction);
                break;
            case 'list':
                await handleListVouches(interaction);
                break;
            case 'view':
                await handleViewVouch(interaction);
                break;
            case 'search':
                await handleSearchVouches(interaction);
                break;
            default:
                await interaction.reply({
                    content: '❌ Unknown subcommand.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error("Error in manage-vouches command:", error);
        await handleCommandError(interaction, error);
    }
}

async function handleAddVouch(interaction: ChatInputCommandInteraction): Promise<void> {
    const helper = interaction.options.getUser('helper', true);
    const user = interaction.options.getUser('user', true);
    const rating = interaction.options.getInteger('rating', true);
    const reason = interaction.options.getString('reason', true);
    const type = interaction.options.getString('type', true) as 'regular' | 'paid';
    const ticketId = interaction.options.getInteger('ticket-id') || null;
    const compensation = interaction.options.getString('compensation');

    const db = new Database();
    await db.connect();

    try {
        // Check if helper exists, if not create them
        let helperRecord = await db.getHelper(helper.id);
        if (!helperRecord) {
            await db.createHelper({
                user_id: helper.id,
                user_tag: helper.tag,
                helper_rank: 'Helper',
                total_vouches: 0,
                helper_since: Date.now(),
                weekly_vouches: 0,
                monthly_vouches: 0,
                average_rating: 0.0,
                is_paid_helper: false,
                vouches_for_paid_access: 0
            });
            helperRecord = await db.getHelper(helper.id);
        }

        // Create the vouch
        await db.createVouch({
            ticket_id: ticketId,
            helper_id: helper.id,
            helper_tag: helper.tag,
            user_id: user.id,
            user_tag: user.tag,
            rating: rating,
            reason: reason,
            type: type,
            compensation: compensation || undefined
        });

        // Update helper stats
        if (helperRecord) {
            const newTotalVouches = helperRecord.total_vouches + 1;
            const newWeeklyVouches = helperRecord.weekly_vouches + 1;
            const newMonthlyVouches = helperRecord.monthly_vouches + 1;

            const allVouches = await db.getHelperVouches(helper.id);
            const totalRating = allVouches.reduce((sum, vouch) => sum + vouch.rating, 0);
            const newAverageRating = totalRating / allVouches.length;

            await db.updateHelper(helper.id, {
                total_vouches: newTotalVouches,
                weekly_vouches: newWeeklyVouches,
                monthly_vouches: newMonthlyVouches,
                average_rating: newAverageRating,
                last_vouch_date: Date.now()
            });

            if (type === 'regular' && !helperRecord.is_paid_helper) {
                await db.incrementPaidHelperVouches(helper.id);
            }
        }

        const stars = '⭐'.repeat(rating);
        const successEmbed = new EmbedBuilder()
            .setTitle("✅ Vouch Added Successfully")
            .setDescription(`Manually added a ${type} vouch for **${helper.tag}**`)
            .addFields([
                { name: '👤 Helper', value: `${helper} (${helper.tag})`, inline: true },
                { name: '👥 User', value: `${user} (${user.tag})`, inline: true },
                { name: '⭐ Rating', value: `${stars} (${rating}/5)`, inline: true },
                { name: '📝 Reason', value: reason, inline: false },
                { name: '🎫 Ticket ID', value: ticketId !== null ? ticketId.toString() : 'N/A', inline: true },
                { name: '📊 Type', value: type === 'paid' ? '💳 Paid' : '✅ Regular', inline: true }
            ])
            .setColor(type === 'paid' ? 0x00d4aa : 0x5865f2)
            .setTimestamp()
            .setFooter({ text: `Added by ${interaction.user.tag}` });

        if (compensation) {
            successEmbed.addFields([
                { name: '💰 Compensation', value: compensation, inline: true }
            ]);
        }

        await interaction.reply({ embeds: [successEmbed] });

        // Log to history channel
        await logVouchToHistory(interaction.guild!.id, {
            userId: user.id,
            userTag: user.tag,
            helperId: helper.id,
            helperTag: helper.tag,
            rating,
            reason,
            ticketType: type,
            compensation: compensation || undefined,
            ticketNumber: ticketId !== null ? ticketId.toString() : 'N/A',
            addedBy: interaction.user.tag
        });

    } finally {
        await db.close();
    }
}

async function handleRemoveVouch(interaction: ChatInputCommandInteraction): Promise<void> {
    const vouchId = interaction.options.getInteger('vouch-id', true);

    const db = new Database();
    await db.connect();

    try {
        // Get the vouch details first
        const vouch = await db.getVouchById(vouchId);

        if (!vouch) {
            const embed = new EmbedBuilder()
                .setTitle("❌ Vouch Not Found")
                .setDescription(`No vouch found with ID ${vouchId}.`)
                .setColor(0xff6b6b);

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        // Delete the vouch
        await db.deleteVouch(vouchId);

        // Update helper stats
        const helper = await db.getHelper(vouch.helper_id);
        if (helper && helper.total_vouches > 0) {
            const newTotalVouches = Math.max(0, helper.total_vouches - 1);
            const newWeeklyVouches = Math.max(0, helper.weekly_vouches - 1);
            const newMonthlyVouches = Math.max(0, helper.monthly_vouches - 1);

            // Recalculate average rating
            const allVouches = await db.getHelperVouches(vouch.helper_id);
            const newAverageRating = allVouches.length > 0
                ? allVouches.reduce((sum, v) => sum + v.rating, 0) / allVouches.length
                : 0;

            await db.updateHelper(vouch.helper_id, {
                total_vouches: newTotalVouches,
                weekly_vouches: newWeeklyVouches,
                monthly_vouches: newMonthlyVouches,
                average_rating: newAverageRating
            });

            if (vouch.type === 'regular' && !helper.is_paid_helper && helper.vouches_for_paid_access > 0) {
                await db.decrementPaidHelperVouches(vouch.helper_id);
            }
        }

        const stars = '⭐'.repeat(vouch.rating);
        const successEmbed = new EmbedBuilder()
            .setTitle("✅ Vouch Removed Successfully")
            .setDescription(`Removed vouch ID ${vouchId} for **${vouch.helper_tag}**`)
            .addFields([
                { name: '👤 Helper', value: `<@${vouch.helper_id}> (${vouch.helper_tag})`, inline: true },
                { name: '👥 User', value: `<@${vouch.user_id}> (${vouch.user_tag})`, inline: true },
                { name: '⭐ Rating', value: `${stars} (${vouch.rating}/5)`, inline: true },
                { name: '📝 Reason', value: vouch.reason, inline: false }
            ])
            .setColor(0xff6b6b)
            .setTimestamp()
            .setFooter({ text: `Removed by ${interaction.user.tag}` });

        await interaction.reply({ embeds: [successEmbed] });

    } finally {
        await db.close();
    }
}

async function handleListVouches(interaction: ChatInputCommandInteraction): Promise<void> {
    const helper = interaction.options.getUser('helper', true);
    const limit = interaction.options.getInteger('limit') || 10;

    const db = new Database();
    await db.connect();

    try {
        const vouches = await db.getHelperVouches(helper.id);

        if (vouches.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle("📋 No Vouches Found")
                .setDescription(`**${helper.tag}** has no vouches yet.`)
                .setColor(0x99aab5);

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        const helperRecord = await db.getHelper(helper.id);
        const embed = new EmbedBuilder()
            .setTitle(`📋 Vouches for ${helper.tag}`)
            .setDescription(`Showing ${Math.min(limit, vouches.length)} of ${vouches.length} total vouches`)
            .setThumbnail(helper.displayAvatarURL())
            .setColor(0x5865f2)
            .setTimestamp();

        if (helperRecord) {
            embed.addFields([
                { name: '📊 Total Vouches', value: helperRecord.total_vouches.toString(), inline: true },
                { name: '⭐ Average Rating', value: helperRecord.average_rating.toFixed(1) + '/5', inline: true },
                { name: '📅 Weekly Vouches', value: helperRecord.weekly_vouches.toString(), inline: true }
            ]);
        }

        // Show most recent vouches
        const recentVouches = vouches.slice(0, limit);
        for (let i = 0; i < recentVouches.length; i++) {
            const vouch = recentVouches[i];
            const stars = '⭐'.repeat(vouch.rating);
            const vouchType = vouch.type === 'paid' ? '💳' : '✅';
            const date = new Date(vouch.created_at).toLocaleDateString();

            embed.addFields([
                {
                    name: `${vouchType} ID: ${vouch.id} - ${stars} (${vouch.rating}/5)`,
                    value: `**From:** <@${vouch.user_id}> (${vouch.user_tag})\n**Date:** ${date}\n**Reason:** ${vouch.reason}\n**Ticket:** ${vouch.ticket_id !== null ? vouch.ticket_id : 'N/A'}`,
                    inline: false
                }
            ]);
        }

        if (vouches.length > limit) {
            embed.setFooter({ text: `Use /manage-vouches list to see more vouches • ${vouches.length - limit} more not shown` });
        } else {
            embed.setFooter({ text: `Use /manage-vouches remove vouch-id:<ID> to remove a vouch` });
        }

        await interaction.reply({ embeds: [embed] });

    } finally {
        await db.close();
    }
}

async function handleViewVouch(interaction: ChatInputCommandInteraction): Promise<void> {
    const vouchId = interaction.options.getInteger('vouch-id', true);

    const db = new Database();
    await db.connect();

    try {
        const vouch = await db.getVouchById(vouchId);

        if (!vouch) {
            const embed = new EmbedBuilder()
                .setTitle("❌ Vouch Not Found")
                .setDescription(`No vouch found with ID ${vouchId}.`)
                .setColor(0xff6b6b);

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        const stars = '⭐'.repeat(vouch.rating);
        const vouchType = vouch.type === 'paid' ? '💳 Paid' : '✅ Regular';
        const date = new Date(vouch.created_at);

        const embed = new EmbedBuilder()
            .setTitle(`🔍 Vouch Details - ID ${vouchId}`)
            .setDescription(`Viewing detailed information for vouch #${vouchId}`)
            .addFields([
                { name: '👤 Helper', value: `<@${vouch.helper_id}> (${vouch.helper_tag})`, inline: true },
                { name: '👥 User', value: `<@${vouch.user_id}> (${vouch.user_tag})`, inline: true },
                { name: '📊 Type', value: vouchType, inline: true },
                { name: '⭐ Rating', value: `${stars} (${vouch.rating}/5)`, inline: true },
                { name: '🎫 Ticket ID', value: vouch.ticket_id !== null ? vouch.ticket_id.toString() : 'N/A', inline: true },
                { name: '📅 Created', value: date.toLocaleString(), inline: true },
                { name: '📝 Reason', value: vouch.reason, inline: false }
            ])
            .setColor(vouch.type === 'paid' ? 0x00d4aa : 0x5865f2)
            .setTimestamp();

        if (vouch.compensation) {
            embed.addFields([
                { name: '💰 Compensation', value: vouch.compensation, inline: true }
            ]);
        }

        await interaction.reply({ embeds: [embed] });

    } finally {
        await db.close();
    }
}

async function handleSearchVouches(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser('user', true);
    const limit = interaction.options.getInteger('limit') || 10;

    const db = new Database();
    await db.connect();

    try {
        const vouches = await db.getVouchesByUser(user.id);

        if (vouches.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle("🔍 No Vouches Found")
                .setDescription(`**${user.tag}** hasn't given any vouches yet.`)
                .setColor(0x99aab5);

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(`🔍 Vouches Given by ${user.tag}`)
            .setDescription(`Showing ${Math.min(limit, vouches.length)} of ${vouches.length} total vouches given by this user`)
            .setThumbnail(user.displayAvatarURL())
            .setColor(0x5865f2)
            .setTimestamp();

        // Show most recent vouches
        const recentVouches = vouches.slice(0, limit);
        for (let i = 0; i < recentVouches.length; i++) {
            const vouch = recentVouches[i];
            const stars = '⭐'.repeat(vouch.rating);
            const vouchType = vouch.type === 'paid' ? '💳' : '✅';
            const date = new Date(vouch.created_at).toLocaleDateString();

            embed.addFields([
                {
                    name: `${vouchType} ID: ${vouch.id} - ${stars} (${vouch.rating}/5)`,
                    value: `**For Helper:** <@${vouch.helper_id}> (${vouch.helper_tag})\n**Date:** ${date}\n**Reason:** ${vouch.reason}\n**Ticket:** ${vouch.ticket_id !== null ? vouch.ticket_id : 'N/A'}`,
                    inline: false
                }
            ]);
        }

        if (vouches.length > limit) {
            embed.setFooter({ text: `Use /manage-vouches search to see more vouches • ${vouches.length - limit} more not shown` });
        } else {
            embed.setFooter({ text: `Use /manage-vouches remove vouch-id:<ID> to remove a vouch` });
        }

        await interaction.reply({ embeds: [embed] });

    } finally {
        await db.close();
    }
}

async function logVouchToHistory(guildId: string, vouchData: {
    userId: string;
    userTag: string;
    helperId: string;
    helperTag: string;
    rating: number;
    reason: string;
    ticketType: 'regular' | 'paid';
    compensation?: string;
    ticketNumber: string;
    addedBy?: string;
}): Promise<void> {
    try {
        const { Client } = require('discord.js');
        const client = require('../../index').client as any;
        if (!client) return;

        const historyChannelId = vouchData.ticketType === 'paid'
            ? process.env.PAID_VOUCH_HISTORY_CHANNEL_ID
            : process.env.VOUCH_HISTORY_CHANNEL_ID;

        if (!historyChannelId) return;

        const historyChannel = await client.channels.fetch(historyChannelId);
        if (!historyChannel?.isTextBased()) return;

        const stars = '⭐'.repeat(vouchData.rating);
        const embed = new EmbedBuilder()
            .setTitle(`${vouchData.ticketType === 'paid' ? '💳' : '✅'} New ${vouchData.ticketType === 'paid' ? 'Paid ' : ''}Vouch ${vouchData.addedBy ? '(Manual)' : ''}`)
            .addFields([
                { name: '👤 Helper', value: `<@${vouchData.helperId}> (${vouchData.helperTag})`, inline: true },
                { name: '👥 User', value: `<@${vouchData.userId}> (${vouchData.userTag})`, inline: true },
                { name: '⭐ Rating', value: `${stars} (${vouchData.rating}/5)`, inline: true },
                { name: '🎫 Ticket', value: vouchData.ticketNumber, inline: true },
                { name: '📝 Reason', value: vouchData.reason, inline: false }
            ])
            .setColor(vouchData.ticketType === 'paid' ? 0x00d4aa : 0x5865f2)
            .setTimestamp();

        if (vouchData.compensation) {
            embed.addFields([
                { name: '💰 Compensation', value: vouchData.compensation, inline: true }
            ]);
        }

        if (vouchData.addedBy) {
            embed.setFooter({ text: `Manually added by ${vouchData.addedBy}` });
        }

        await historyChannel.send({ embeds: [embed] });

    } catch (error) {
        console.error('Error logging vouch to history:', error);
    }
}

async function handleCommandError(interaction: ChatInputCommandInteraction, error: any): Promise<void> {
    console.error("Manage vouches command error:", error);

    try {
        const errorMessage = "❌ Failed to execute command. Please try again later.";

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    } catch (followUpError) {
        console.error("Failed to send error message:", followUpError);
    }
}

export default { data, execute };
