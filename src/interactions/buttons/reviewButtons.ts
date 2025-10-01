import { ButtonInteraction, ModalSubmitInteraction, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { getDatabase } from '../../database';
import { finalizeTicketClosure } from './ticketManagement';
import { botLogger } from '../../utils/logger';

export async function handleReviewButtons(interaction: ButtonInteraction): Promise<void> {
    const { customId } = interaction;
    
    if (customId.startsWith('close_skip_review_')) {
        const ticketNumber = customId.split('_')[3];
        await handleSkipReview(interaction, ticketNumber);
        return;
    }
    
    const parts = customId.split('_');
    const isCloseReview = customId.startsWith('close_review_');
    const expectedParts = isCloseReview ? 6 : 5;
    
    if (parts.length < expectedParts) {
        await interaction.reply({
            content: "❌ Invalid review button data.",
            flags: [64] // ephemeral
        });
        return;
    }

    const rating = parseInt(isCloseReview ? parts[2] : parts[1]);
    const ticketNumber = isCloseReview ? parts[3] : parts[2];
    const helperId = isCloseReview ? parts[4] : parts[3];
    const ticketType = (isCloseReview ? parts[5] : parts[4]) as 'regular' | 'paid';

    if (rating < 1 || rating > 5) {
        await interaction.reply({
            content: "❌ Invalid rating value.",
            flags: [64] // ephemeral
        });
        return;
    }

    const db = getDatabase();
    try {
        const ticket = await db.getTicket(ticketNumber);
        
        if (!ticket) {
            await interaction.reply({
                content: "❌ Could not find ticket information.",
                flags: [64] // ephemeral
            });
            return;
        }

        if (ticket.user_id !== interaction.user.id) {
            await interaction.reply({
                content: "❌ You can only review your own tickets.",
                flags: [64] // ephemeral
            });
            return;
        }

        await showReviewModal(interaction, rating, ticketNumber, helperId, ticketType, isCloseReview);

    } catch (error) {
        console.error('Error handling review button:', error);
        await interaction.reply({
            content: "❌ An error occurred while processing your review. Please try again.",
            flags: [64] // ephemeral
        });
    }
}

async function showReviewModal(
    interaction: ButtonInteraction, 
    rating: number, 
    ticketNumber: string, 
    helperId: string, 
    ticketType: 'regular' | 'paid',
    isCloseReview: boolean = false
): Promise<void> {
    const modalCustomId = isCloseReview 
        ? `close_review_modal_${rating}_${ticketNumber}_${helperId}_${ticketType}`
        : `review_modal_${rating}_${ticketNumber}_${helperId}_${ticketType}`;
        
    const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle(`Review - ${rating} Star${rating > 1 ? 's' : ''}`);

    const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Tell us about your experience')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Describe what you liked or what could be improved...')
        .setMinLength(1)
        .setMaxLength(500)
        .setRequired(true);

    let compensationInput: TextInputBuilder | null = null;
    
    if (ticketType === 'paid') {
        compensationInput = new TextInputBuilder()
            .setCustomId('compensation')
            .setLabel('What did you pay for this help? (optional)')
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

    await interaction.showModal(modal);
}

export async function processReviewSubmission(
    interaction: ButtonInteraction | ModalSubmitInteraction,
    userId: string,
    userTag: string,
    helperId: string,
    rating: number,
    reason: string,
    ticketNumber: string,
    ticketType: 'regular' | 'paid',
    compensation?: string,
    guildId?: string
): Promise<void> {
    const db = getDatabase();
    
    try {
        const ticket = await db.getTicket(ticketNumber);
        if (!ticket) {
            throw new Error('Ticket not found');
        }

        let helper = await db.getHelper(helperId);
        
        if (!helper) {
            console.log(`⚠️ Helper ${helperId} not found, creating new helper record`);
            
            let helperTag = 'Unknown Helper';
            try {
                const helperUser = await interaction.client.users.fetch(helperId);
                helperTag = helperUser.tag;
            } catch (error) {
                console.warn(`Could not fetch helper user ${helperId}:`, error);
            }
            
            await db.createHelper({
                user_id: helperId,
                user_tag: helperTag,
                helper_rank: 'Helper',
                total_vouches: 0,
                last_vouch_date: null,
                helper_since: Date.now(),
                weekly_vouches: 0,
                monthly_vouches: 0,
                average_rating: 0,
                is_paid_helper: ticketType === 'paid',
                vouches_for_paid_access: 0
            });
            helper = await db.getHelper(helperId);
        }
        
        const helperTag = helper?.user_tag || 'Unknown Helper';

        await db.createVouch({
            ticket_id: ticket.id,
            helper_id: helperId,
            helper_tag: helperTag,
            user_id: userId,
            user_tag: userTag,
            rating: rating,
            reason: reason || 'No additional feedback provided',
            type: ticketType,
            compensation: compensation
        });

        await botLogger.logVouchCreated(ticket.ticket_number, helperId, userId, rating, reason || 'No additional feedback provided');

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

            if (!helper.is_paid_helper && newWeeklyVouches >= 10 && ticketType === 'regular') {
                await db.updateHelper(helperId, { is_paid_helper: true });
            }
        }

        if (guildId) {
            await sendToVouchChannel(guildId, {
                userId,
                userTag,
                helperId,
                helperTag,
                rating,
                reason: reason || 'No additional feedback provided',
                ticketType,
                compensation,
                ticketNumber
            });
        }

        console.log(` Review processed for ticket #${ticketNumber} - ${rating} stars`);

    } catch (error) {
        console.error('Error processing review submission:', error);
        throw error;
    }
}

async function sendToVouchChannel(guildId: string, vouchData: {
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
        console.log(` Attempting to send review to ${vouchData.ticketType} vouch channel for ticket #${vouchData.ticketNumber}`);
        
        const client = require('../../index').client as any;
        if (!client) {
            console.error(' Client not found when trying to send to vouch channel');
            return;
        }
        
        const guild = await client.guilds.fetch(guildId);
        console.log(`Guild fetched: ${guild.name}`);

        const historyChannelId = vouchData.ticketType === 'paid'
            ? process.env.PAID_VOUCH_HISTORY_CHANNEL_ID
            : process.env.VOUCH_HISTORY_CHANNEL_ID;

        console.log(`Using channel ID: ${historyChannelId} for ${vouchData.ticketType} vouches`);

        if (!historyChannelId) {
            console.error(`No channel ID configured for ${vouchData.ticketType} vouches`);
            return;
        }

        // Fetch channel directly from client instead of guild to handle cross-guild channels
        const historyChannel = await client.channels.fetch(historyChannelId);
        if (!historyChannel?.isTextBased()) {
            console.error(`Vouch channel not found or not text-based: ${historyChannelId}`);
            return;
        }

        console.log(`Found vouch channel: ${historyChannel.name}`);

        const stars = '⭐'.repeat(vouchData.rating);
        const embed = new EmbedBuilder()
            .setTitle(`${vouchData.ticketType === 'paid' ? '💳' : '✅'} New ${vouchData.ticketType === 'paid' ? 'Paid ' : ''}Review`)
            .addFields([
                { name: '👤 Helper', value: `<@${vouchData.helperId}> (${vouchData.helperTag})`, inline: true },
                { name: '👥 User', value: `<@${vouchData.userId}> (${vouchData.userTag})`, inline: true },
                { name: '⭐ Rating', value: `${stars} (${vouchData.rating}/5)`, inline: true },
                { name: '🎫 Ticket', value: `#${vouchData.ticketNumber}`, inline: true },
                { name: '📝 Feedback', value: vouchData.reason, inline: false }
            ])
            .setColor(vouchData.ticketType === 'paid' ? 0x00d4aa : 0x5865f2)
            .setFooter({ text: 'Automated review system' })
            .setTimestamp();

        if (vouchData.compensation) {
            embed.addFields([
                { name: '💰 Compensation', value: vouchData.compensation, inline: true }
            ]);
        }

        await historyChannel.send({ embeds: [embed] });
        console.log(` Review successfully posted to ${vouchData.ticketType} vouch channel for ticket #${vouchData.ticketNumber}`);

    } catch (error) {
        console.error(` Error sending review to vouch channel for ticket #${vouchData.ticketNumber}:`, error);
    }
}

async function handleSkipReview(interaction: ButtonInteraction, ticketNumber: string): Promise<void> {
    try {
        const db = getDatabase();
        const ticket = await db.getTicket(ticketNumber);
        
        if (!ticket) {
            await interaction.reply({
                content: "❌ Could not find ticket information.",
                ephemeral: true
            });
            return;
        }

        await finalizeTicketClosure(interaction, ticket);
        
        console.log(` Ticket #${ticketNumber} closed without review (skipped by user)`);
    } catch (error) {
        console.error('Error handling skip review:', error);
        await interaction.reply({
            content: "❌ An error occurred while closing the ticket. Please try again.",
            ephemeral: true
        });
    }
}