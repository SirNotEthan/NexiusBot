import { ModalSubmitInteraction, EmbedBuilder, ChannelType } from 'discord.js';
import { VouchTicketData } from '../../commands/vouch/request-carry';
import { processVouch } from '../../commands/vouch/vouch';
import { processBioSetting } from '../../commands/vouch/tracker';

export async function handleVouchGoalModal(interaction: ModalSubmitInteraction): Promise<void> {
    const goal = interaction.fields.getTextInputValue('goal');
    const userId = interaction.customId.split('_')[3];
    
    if (interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ This modal is not for you!", ephemeral: true });
        return;
    }

    const currentEmbed = interaction.message?.embeds[0];
    
    const embedTitle = currentEmbed?.title || '';
    const isPaidTicket = embedTitle.includes('💳') || embedTitle.includes('Paid');
    const ticketData: VouchTicketData = { type: isPaidTicket ? 'paid' : 'regular', goal };
    
    if (currentEmbed) {
        currentEmbed.fields?.forEach(field => {
            const fieldName = field.name?.replace(/\*\*/g, '').trim();
            switch (fieldName) {
                case "🎲 Game":
                    if (field.value !== "❌ *Not set*") {
                        const displayName = field.value.replace(/`/g, '').trim();
                        if (displayName === "Anime Last Stand") ticketData.game = "als";
                        else if (displayName === "Anime Vanguard") ticketData.game = "av";
                        else ticketData.game = displayName.toLowerCase();
                    }
                    break;
                case "🎮 Gamemode":
                    if (field.value !== "❌ *Not set*") {
                        ticketData.gamemode = field.value.replace(/`/g, '').trim();
                    }
                    break;
                case "🔗 Can Join Links":
                    if (field.value === "✅ Yes") ticketData.canJoinLinks = true;
                    else if (field.value === "❌ No") ticketData.canJoinLinks = false;
                    break;
                case "👤 Selected Helper":
                    if (field.value && field.value !== "❌ *Not set*") {
                        const match = field.value.match(/<@(\d+)>/);
                        if (match) {
                            ticketData.selectedHelper = match[1];
                        }
                    }
                    break;
            }
        });
    }

    await updateVouchTicketEmbed(interaction, ticketData);
}

export async function handleVouchReasonModal(interaction: ModalSubmitInteraction): Promise<void> {
    const parts = interaction.customId.split('_');
    const userId = parts[3];
    const helperId = parts[4];
    const rating = parseInt(parts[5]);
    const ticketId = parseInt(parts[6]);
    const ticketType = parts[7] as 'regular' | 'paid';
    
    if (interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ This vouch is not for you!", ephemeral: true });
        return;
    }

    const reason = interaction.fields.getTextInputValue('reason');
    const compensation = interaction.fields.getTextInputValue('compensation') || undefined;

    try {
        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply({ content: "❌ This command can only be used in a server!", ephemeral: true });
            return;
        }

        const helper = await guild.members.fetch(helperId);
        
        await processVouch(
            userId,
            interaction.user.tag,
            helperId,
            helper.user.tag,
            rating,
            reason,
            ticketId,
            ticketType,
            compensation,
            interaction.channelId,
            guild.id
        );

        const stars = '⭐'.repeat(rating);
        const successEmbed = new EmbedBuilder()
            .setTitle("✅ Vouch Submitted Successfully!")
            .setDescription(`Thank you for vouching for **${helper.user.tag}**!`)
            .addFields([
                { name: '⭐ Rating', value: `${stars} (${rating}/5)`, inline: true },
                { name: '📝 Reason', value: reason, inline: false }
            ])
            .setColor(0x00ff00)
            .setFooter({ text: "This ticket will be closed in 10 seconds" });

        if (compensation) {
            successEmbed.addFields([
                { name: '💰 Compensation', value: compensation, inline: true }
            ]);
        }

        await interaction.reply({ embeds: [successEmbed] });

        setTimeout(async () => {
            try {
                const channel = interaction.channel;
                if (channel && channel.type === ChannelType.GuildText) {
                    await channel.delete('Ticket auto-closed after vouch submission');
                }
            } catch (error) {
                console.error('Error auto-closing ticket:', error);
            }
        }, 10000);

    } catch (error) {
        console.error('Error processing vouch:', error);
        await interaction.reply({ content: "❌ Failed to process vouch. Please try again.", ephemeral: true });
    }
}

export async function handlePaidBioModal(interaction: ModalSubmitInteraction): Promise<void> {
    const userId = interaction.customId.split('_')[3];
    
    if (interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ This bio form is not for you!", ephemeral: true });
        return;
    }

    const bio = interaction.fields.getTextInputValue('bio');

    try {
        await processBioSetting(userId, interaction.user.tag, bio);
        
        const successEmbed = new EmbedBuilder()
            .setTitle("✅ Paid Helper Bio Set!")
            .setDescription("Your bio has been set and you are now visible on the paid helper tracker board.")
            .addFields([
                { name: '💼 Your Bio', value: bio, inline: false },
                { name: '⏰ Expires', value: 'In 7 days (must be renewed weekly)', inline: true }
            ])
            .setColor(0x00d4aa);

        await interaction.reply({ embeds: [successEmbed], ephemeral: true });

    } catch (error) {
        console.error('Error setting paid bio:', error);
        await interaction.reply({ content: "❌ Failed to set bio. Please try again.", ephemeral: true });
    }
}

async function updateVouchTicketEmbed(interaction: any, ticketData: VouchTicketData): Promise<void> {
    const { createVouchTicketEmbed, createVouchTicketComponents } = require('../../commands/vouch/request-carry');
    
    const embed = createVouchTicketEmbed(ticketData);
    const components = createVouchTicketComponents(ticketData, interaction.user.id);

    await interaction.deferUpdate();
    await interaction.editReply({
        embeds: [embed],
        components: components
    });
}