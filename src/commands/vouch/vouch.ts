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
            .setDescription('The helper to vouch for')
            .setRequired(true)
    );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        const helper = interaction.options.getUser('helper', true);
        const db = new Database();
        await db.connect();

        try {
            // Check if the user has any recent closed tickets with this helper
            const recentTicketsQuery = `
                SELECT * FROM tickets
                WHERE user_id = ? AND claimed_by = ? AND status = 'closed'
                AND created_at > ?
                ORDER BY created_at DESC LIMIT 1
            `;
            const recentTickets = (db as any).db!.prepare(recentTicketsQuery).all([
                interaction.user.id,
                helper.id,
                Date.now() - (7 * 24 * 60 * 60 * 1000)
            ]); // 7 days ago

            if (!recentTickets || recentTickets.length === 0) {
                await interaction.reply({
                    content: "❌ **No recent tickets found** with this helper. You can only vouch for helpers who have recently helped you in a ticket within the last 7 days.",
                    ephemeral: true
                });
                return;
            }

            const ticket = recentTickets[0];

            // Check if already vouched for this ticket
            const existingVouchQuery = `
                SELECT * FROM vouches
                WHERE ticket_id = ? AND user_id = ?
            `;
            const existingVouch = (db as any).db!.prepare(existingVouchQuery).all([ticket.id, interaction.user.id]);

            if (existingVouch && existingVouch.length > 0) {
                await interaction.reply({
                    content: "❌ **You have already submitted a review** for this helper on your recent ticket.",
                    ephemeral: true
                });
                return;
            }

            await showRatingSelection(interaction, helper.id, helper.tag, ticket.ticket_number, ticket.type);

        } finally {
            await db.close();
        }

    } catch (error) {
        console.error("Error in vouch command:", error);
        await handleVouchError(interaction, error);
    }
}

async function showRatingSelection(
    interaction: ChatInputCommandInteraction, 
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

    await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
    });
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

        const helper = await db.getHelper(helperId);
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

        const ticket = await db.getTicket((await db.getTicketByChannelId(channelId!))?.ticket_number!);
        if (ticket) {
            await db.closeTicket(ticket.ticket_number);
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
                ticketNumber: ticket?.ticket_number || 'Unknown'
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