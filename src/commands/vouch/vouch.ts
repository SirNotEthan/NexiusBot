import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelType
} from 'discord.js';
import Database from '../../database/database';

const data = new SlashCommandBuilder()
    .setName("vouch")
    .setDescription("Vouch for a helper after receiving help")
    .addUserOption(option =>
        option.setName('helper')
            .setDescription('The helper to vouch for (auto-detected in ticket channels)')
            .setRequired(false)
    );

/**
 * Get unvouched tickets for a user with a specific helper
 */
export async function getUnvouchedTickets(userId: string, helperId: string): Promise<any[]> {
    const db = new Database();
    await db.connect();

    try {
        // Check if the user has any recent tickets (open, claimed, or closed) with this helper
        const recentTicketsQuery = `
            SELECT * FROM tickets
            WHERE user_id = ? AND claimed_by = ? AND status IN ('open', 'claimed', 'closed')
            AND created_at > ?
            ORDER BY created_at DESC LIMIT 10
        `;
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const recentTickets = (db as any).db!.prepare(recentTicketsQuery).all([
            userId,
            helperId,
            sevenDaysAgo
        ]);

        if (!recentTickets || recentTickets.length === 0) {
            return [];
        }

        // Filter out tickets that have already been vouched for
        const unvouchedTickets = [];
        for (const ticket of recentTickets) {
            const existingVouchQuery = `
                SELECT * FROM vouches
                WHERE ticket_id = ? AND user_id = ?
            `;
            // Note: ticket_id in vouches table is the internal ticket.id, not ticket_number
            const existingVouch = (db as any).db!.prepare(existingVouchQuery).all([ticket.id, userId]);

            if (!existingVouch || existingVouch.length === 0) {
                unvouchedTickets.push(ticket);
            }
        }

        return unvouchedTickets;
    } finally {
        await db.close();
    }
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        const db = new Database();
        await db.connect();

        let helper = interaction.options.getUser('helper');
        let currentTicket = null;

        try {
            // Check if we're in a ticket channel
            const ticket = await db.getTicketByChannelId(interaction.channelId);

            if (ticket) {
                currentTicket = ticket;

                // Verify the user is the ticket owner
                if (ticket.user_id !== interaction.user.id) {
                    await interaction.reply({
                        content: `❌ **You can only vouch for help you received.**\n\nThis is not your ticket.`,
                        ephemeral: true
                    });
                    return;
                }

                // Check if ticket has a claimed helper
                if (!ticket.claimed_by) {
                    await interaction.reply({
                        content: `❌ **No helper has claimed this ticket yet.**\n\nWait for a helper to claim your ticket, or specify a helper with \`/vouch helper:@username\`.`,
                        ephemeral: true
                    });
                    return;
                }

                // If no helper specified, use the ticket's helper
                if (!helper) {
                    try {
                        helper = await interaction.client.users.fetch(ticket.claimed_by);
                        console.log(`[VOUCH] Auto-detected helper ${helper.tag} from ticket channel #${ticket.ticket_number}`);
                    } catch (error) {
                        console.error('[VOUCH] Error fetching helper user:', error);
                        await interaction.reply({
                            content: `❌ **Could not find the helper who claimed this ticket.**\n\nPlease specify the helper manually with \`/vouch helper:@username\`.`,
                            ephemeral: true
                        });
                        return;
                    }
                }

                // Check if ticket type is valid for vouching
                if (ticket.type !== 'regular' && ticket.type !== 'paid') {
                    await interaction.reply({
                        content: `❌ **This ticket type does not support vouching.**\n\nYou can only vouch for regular or paid carry tickets.`,
                        ephemeral: true
                    });
                    return;
                }

                // Check if this ticket has already been vouched for
                const existingVouchQuery = `
                    SELECT * FROM vouches
                    WHERE ticket_id = ? AND user_id = ?
                `;
                const existingVouch = (db as any).db!.prepare(existingVouchQuery).get([ticket.id, interaction.user.id]);

                if (existingVouch) {
                    await interaction.reply({
                        content: `❌ **You have already vouched for this ticket.**\n\nYou can only vouch once per ticket.`,
                        ephemeral: true
                    });
                    return;
                }

                // If ticket status is open or claimed, we can vouch directly
                if (ticket.status === 'open' || ticket.status === 'claimed') {
                    console.log(`[VOUCH] Vouching in open/claimed ticket #${ticket.ticket_number} for helper ${helper.tag}`);
                    await showRatingSelection(interaction, helper.id, helper.tag, ticket.id, ticket.type as 'regular' | 'paid');
                    return;
                }
            }

            // If not in a ticket channel or ticket is closed, require helper parameter
            if (!helper) {
                await interaction.reply({
                    content: `❌ **Please specify a helper to vouch for.**\n\nUse \`/vouch helper:@username\` or use this command in an active ticket channel.`,
                    ephemeral: true
                });
                return;
            }

            // Original flow: find unvouched tickets with the specified helper
            const unvouchedTickets = await getUnvouchedTickets(interaction.user.id, helper.id);

            if (unvouchedTickets.length === 0) {
                await interaction.reply({
                    content: `❌ **No recent tickets found** with ${helper.tag}.\n\nYou can only vouch for helpers who have recently helped you in a ticket within the last 7 days, and you may have already reviewed all your tickets with this helper.`,
                    ephemeral: true
                });
                return;
            }

            // If multiple unvouched tickets, show selection
            if (unvouchedTickets.length > 1) {
                await showTicketSelection(interaction, helper.id, helper.tag, unvouchedTickets);
            } else {
                const ticket = unvouchedTickets[0];
                console.log(`[VOUCH] Found ticket #${ticket.ticket_number} (ID: ${ticket.id}) for user ${interaction.user.tag} with helper ${helper.tag}`);
                await showRatingSelection(interaction, helper.id, helper.tag, ticket.id, ticket.type);
            }

        } finally {
            await db.close();
        }

    } catch (error) {
        console.error("Error in vouch command:", error);
        await handleVouchError(interaction, error);
    }
}

export async function showTicketSelection(
    interaction: ChatInputCommandInteraction | any,
    helperId: string,
    helperTag: string,
    tickets: any[]
): Promise<void> {
    const embed = new EmbedBuilder()
        .setTitle("🎫 Select a Ticket to Review")
        .setDescription(`You have multiple tickets with **${helperTag}**. Please select which one you'd like to review:`)
        .setColor(0x5865f2);

    const ticketOptions = tickets.map(ticket => ({
        label: `Ticket #${ticket.ticket_number}`,
        value: `${ticket.ticket_number}`,
        description: `${ticket.gamemode || 'Unknown'} - ${new Date(ticket.created_at).toLocaleDateString()}`
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`vouch_ticket_select_${interaction.user.id}_${helperId}`)
        .setPlaceholder('Choose a ticket to review...')
        .addOptions(ticketOptions.map(option =>
            new StringSelectMenuOptionBuilder()
                .setLabel(option.label)
                .setValue(option.value)
                .setDescription(option.description)
        ));

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const replyOptions = {
        embeds: [embed],
        components: [row],
        ephemeral: true
    };

    // Handle both ChatInputCommandInteraction and ButtonInteraction
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply(replyOptions);
    } else if ('update' in interaction && typeof interaction.update === 'function') {
        await interaction.update(replyOptions);
    } else {
        await interaction.reply(replyOptions);
    }
}

export async function showRatingSelection(
    interaction: ChatInputCommandInteraction | any,
    helperId: string,
    helperTag: string,
    ticketId: number,
    ticketType: 'regular' | 'paid'
): Promise<void> {
    const embed = new EmbedBuilder()
        .setTitle("⭐ Rate Your Experience")
        .setDescription(`How would you rate the help you received from **${helperTag}**?\n\nSelect a rating from 1-5 stars:`)
        .setColor(0x5865f2);

    const ratingOptions = [
        { label: '⭐ 1 Star - Poor', value: '1', description: 'Very unsatisfied with the help' },
        { label: '⭐⭐ 2 Stars - Below Average', value: '2', description: 'Unsatisfied with the help' },
        { label: '⭐⭐⭐ 3 Stars - Average', value: '3', description: 'Neutral about the help' },
        { label: '⭐⭐⭐⭐ 4 Stars - Good', value: '4', description: 'Satisfied with the help' },
        { label: '⭐⭐⭐⭐⭐ 5 Stars - Excellent', value: '5', description: 'Very satisfied with the help' }
    ];

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`vouch_rating_${interaction.user.id}_${helperId}_${ticketId}_${ticketType}`)
        .setPlaceholder('Choose a rating...')
        .addOptions(ratingOptions.map(option =>
            new StringSelectMenuOptionBuilder()
                .setLabel(option.label)
                .setValue(option.value)
                .setDescription(option.description)
        ));

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const replyOptions = {
        embeds: [embed],
        components: [row],
        ephemeral: true
    };

    // Handle both ChatInputCommandInteraction and ButtonInteraction
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply(replyOptions);
    } else if ('update' in interaction && typeof interaction.update === 'function') {
        await interaction.update(replyOptions);
    } else {
        await interaction.reply(replyOptions);
    }
}

export function createVouchReasonModal(
    userId: string, 
    helperId: string, 
    rating: number, 
    ticketId: number,
    ticketType: 'regular' | 'paid'
): ModalBuilder {
    const modal = new ModalBuilder()
        .setCustomId(`vouch_reason_modal_${userId}_${helperId}_${rating}_${ticketId}_${ticketType}`)
        .setTitle(`Vouch for Helper - ${rating} Star${rating > 1 ? 's' : ''}`);

    const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Why are you vouching for this helper?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Describe your experience with this helper...')
        .setMinLength(10)
        .setMaxLength(500)
        .setRequired(true);

    let compensationInput: TextInputBuilder | null = null;
    
    if (ticketType === 'paid') {
        compensationInput = new TextInputBuilder()
            .setCustomId('compensation')
            .setLabel('What did you pay for this help?')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 5m GP, Dragon Bones, etc.')
            .setMaxLength(100)
            .setRequired(false);
    }

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
    modal.addComponents(firstActionRow);

    if (compensationInput) {
        const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(compensationInput);
        modal.addComponents(secondActionRow);
    }

    return modal;
}

export async function processVouch(
    userId: string,
    userTag: string,
    helperId: string,
    helperTag: string,
    rating: number,
    reason: string,
    ticketId: number,
    ticketType: 'regular' | 'paid',
    compensation?: string,
    channelId?: string,
    guildId?: string
): Promise<void> {
    const db = new Database();
    await db.connect();

    try {
        // Ensure helper exists in the database before creating vouch (foreign key constraint)
        let helper = await db.getHelper(helperId);
        if (!helper) {
            console.log(`[VOUCH] Helper ${helperId} (${helperTag}) not found in database, creating new helper record...`);
            await db.createHelper({
                user_id: helperId,
                user_tag: helperTag,
                helper_rank: 'Helper',
                total_vouches: 0,
                helper_since: Date.now(),
                weekly_vouches: 0,
                monthly_vouches: 0,
                average_rating: 0.0,
                is_paid_helper: false,
                vouches_for_paid_access: 0
            });
            helper = await db.getHelper(helperId);
        }

        await db.createVouch({
            ticket_id: ticketId,
            helper_id: helperId,
            helper_tag: helperTag,
            user_id: userId,
            user_tag: userTag,
            rating: rating,
            reason: reason,
            type: ticketType,
            compensation: compensation
        });

        if (helper) {
            const newTotalVouches = helper.total_vouches + 1;
            const newWeeklyVouches = helper.weekly_vouches + 1;
            const newMonthlyVouches = helper.monthly_vouches + 1;
            
            const allVouches = await db.getHelperVouches(helperId);
            const totalRating = allVouches.reduce((sum, vouch) => sum + vouch.rating, 0);
            const newAverageRating = totalRating / allVouches.length;

            await db.updateHelper(helperId, {
                total_vouches: newTotalVouches,
                weekly_vouches: newWeeklyVouches,
                monthly_vouches: newMonthlyVouches,
                average_rating: newAverageRating,
                last_vouch_date: Date.now()
            });

            if (ticketType === 'regular' && !helper.is_paid_helper) {
                await db.incrementPaidHelperVouches(helperId);
            }
        }

        // Close the ticket if channel ID is provided and get ticket number for logging
        let ticketNumberForLog = 'Unknown';
        if (channelId) {
            const ticket = await db.getTicketByChannelId(channelId);
            if (ticket) {
                ticketNumberForLog = ticket.ticket_number;
                if (ticket.status !== 'closed') {
                    await db.closeTicket(ticket.ticket_number);
                    console.log(`[VOUCH] Closed ticket #${ticket.ticket_number} after vouch submission`);
                }
            }
        }

        if (guildId) {
            await logVouchToHistory(guildId, {
                userId,
                userTag,
                helperId,
                helperTag,
                rating,
                reason,
                ticketType,
                compensation,
                ticketNumber: ticketNumberForLog
            });
        }

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
}): Promise<void> {
    try {
        const { Client } = require('discord.js');
        const client = require('../../index').client as any;
        if (!client) return;
        const guild = await client.guilds.fetch(guildId);
        
        const historyChannelId = vouchData.ticketType === 'paid' 
            ? process.env.PAID_VOUCH_HISTORY_CHANNEL_ID 
            : process.env.VOUCH_HISTORY_CHANNEL_ID;
        
        if (!historyChannelId) return;
        
        // Fetch channel directly from client instead of guild to handle cross-guild channels
        const historyChannel = await client.channels.fetch(historyChannelId);
        if (!historyChannel?.isTextBased()) return;

        const stars = '⭐'.repeat(vouchData.rating);
        const embed = new EmbedBuilder()
            .setTitle(`${vouchData.ticketType === 'paid' ? '💳' : '✅'} New ${vouchData.ticketType === 'paid' ? 'Paid ' : ''}Vouch`)
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

        await historyChannel.send({ embeds: [embed] });

    } catch (error) {
        console.error('Error logging vouch to history:', error);
    }
}

async function handleVouchError(interaction: ChatInputCommandInteraction, error: any): Promise<void> {
    console.error("Vouch command error:", error);
    
    try {
        const errorMessage = "❌ Failed to process vouch. Please try again later.";
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    } catch (followUpError) {
        console.error("Failed to send vouch error message:", followUpError);
    }
}

export default { data, execute };