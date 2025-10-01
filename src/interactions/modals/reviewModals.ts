import { ModalSubmitInteraction, EmbedBuilder } from 'discord.js';
import { processReviewSubmission } from '../buttons/reviewButtons';
import { closeTicketAfterReview } from '../buttons/ticketManagement';
import { getDatabase } from '../../database';

export async function handleReviewModal(interaction: ModalSubmitInteraction): Promise<void> {
    const { customId } = interaction;
    
    const parts = customId.split('_');
    const isCloseReview = customId.startsWith('close_review_modal_');
    const expectedParts = isCloseReview ? 7 : 6;
    
    if (parts.length < expectedParts) {
        await interaction.reply({
            content: "❌ Invalid review modal data.",
            ephemeral: true
        });
        return;
    }

    const rating = parseInt(isCloseReview ? parts[3] : parts[2]);
    const ticketNumber = isCloseReview ? parts[4] : parts[3];
    const helperId = isCloseReview ? parts[5] : parts[4];
    const ticketType = (isCloseReview ? parts[6] : parts[5]) as 'regular' | 'paid';

    const reason = interaction.fields.getTextInputValue('reason') || '';
    let compensation: string | undefined = undefined;
    
    if (ticketType === 'paid') {
        try {
            compensation = interaction.fields.getTextInputValue('compensation') || undefined;
        } catch (error) {
            compensation = undefined;
        }
    }

    try {
        await interaction.deferReply({ ephemeral: true });

        console.log(`Processing review submission: ${rating} stars for ticket #${ticketNumber} (${ticketType})`);

        const guildId = process.env.GUILD_ID;
        console.log(`Using guild ID: ${guildId}`);
        
        await processReviewSubmission(
            interaction,
            interaction.user.id,
            interaction.user.tag,
            helperId,
            rating,
            reason,
            ticketNumber,
            ticketType,
            compensation,
            guildId
        );

        console.log(`Review submission completed for ticket #${ticketNumber}`);

        if (isCloseReview) {
            const db = getDatabase();
            const ticket = await db.getTicket(ticketNumber);
            
            if (ticket && interaction.guild) {
                await closeTicketAfterReview(
                    ticket, 
                    ticket.channel_id, 
                    interaction.guild.id, 
                    interaction.user.id, 
                    interaction.user.tag
                );
                console.log(`Ticket #${ticketNumber} automatically closed after review submission`);
            }
        }

        const stars = '⭐'.repeat(rating);
        const confirmationEmbed = new EmbedBuilder()
            .setTitle("✅ Thank You for Your Review!")
            .setDescription(`Your ${stars} (${rating}/5) rating has been submitted successfully and sent to the ${ticketType === 'paid' ? 'paid vouches' : 'vouches'} channel!`)
            .setColor(0x00ff00)
            .addFields([
                { name: '🎫 Ticket', value: `#${ticketNumber}`, inline: true },
                { name: '⭐ Rating', value: `${stars} (${rating}/5)`, inline: true },
                { name: '📢 Posted To', value: ticketType === 'paid' ? '💳 Paid Vouches Channel' : '✅ Regular Vouches Channel', inline: true }
            ])
            .setFooter({ text: 'Your feedback helps us improve our service • Thank you!' })
            .setTimestamp();

        if (reason.trim()) {
            confirmationEmbed.addFields([
                { name: '📝 Your Feedback', value: reason.length > 100 ? `${reason.substring(0, 100)}...` : reason, inline: false }
            ]);
        }

        if (compensation) {
            confirmationEmbed.addFields([
                { name: '💰 Compensation', value: compensation, inline: true }
            ]);
        }

        const completedEmbed = new EmbedBuilder()
            .setTitle("✅ Review Completed")
            .setDescription(`Thank you! You rated this experience ${stars} (${rating}/5 stars).`)
            .setColor(0x00ff00)
            .setFooter({ text: `Ticket #${ticketNumber} • Review submitted` })
            .setTimestamp();

        await interaction.editReply({
            embeds: [completedEmbed]
        });

        await interaction.followUp({
            embeds: [confirmationEmbed],
            flags: [64] // ephemeral
        });

        console.log(`Review completed by ${interaction.user.tag} for ticket #${ticketNumber}: ${rating} stars`);

    } catch (error) {
        console.error('Error processing review modal:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Review Submission Failed")
            .setDescription("Sorry, there was an error processing your review. Please try again or contact support if the problem persists.")
            .setColor(0xff0000)
            .setFooter({ text: "Error occurred during submission" })
            .setTimestamp();

        await interaction.editReply({
            embeds: [errorEmbed]
        });
    }
}