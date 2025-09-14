import { StringSelectMenuInteraction, EmbedBuilder } from 'discord.js';
import { VouchTicketData, showTicketForm } from '../../commands/vouch/request-carry';
import { createVouchReasonModal, processVouch } from '../../commands/vouch/vouch';

export async function handleVouchGamemodeSelection(interaction: StringSelectMenuInteraction): Promise<void> {
    const userId = interaction.customId.split('_')[2];
    
    if (interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ This menu is not for you!", ephemeral: true });
        return;
    }

    const selectedGamemode = interaction.values[0];
    
    const currentEmbed = interaction.message.embeds[0];
    
    const embedTitle = currentEmbed?.title || '';
    const isPaidTicket = embedTitle.includes('💳') || embedTitle.includes('Paid');
    const ticketData: VouchTicketData = { type: isPaidTicket ? 'paid' : 'regular' };
    
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
            case "🎯 Goal":
                if (field.value !== "❌ *Not set*") {
                    ticketData.goal = field.value.replace(/`/g, '').trim();
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

    ticketData.gamemode = selectedGamemode;
    await updateVouchTicketEmbed(interaction, ticketData);
}

export async function handlePaidHelperSelection(interaction: StringSelectMenuInteraction): Promise<void> {
    const selectedHelperId = interaction.values[0];
    
    const parts = interaction.customId.split('_');
    const userId = parts[3];
    const game = parts[4];
    
    const ticketData: VouchTicketData = { 
        type: 'paid',
        selectedHelper: selectedHelperId,
        game: game
    };
    
    await showTicketForm(interaction, ticketData);
}

export async function handleVouchRatingSelection(interaction: StringSelectMenuInteraction): Promise<void> {
    const parts = interaction.customId.split('_');
    const userId = parts[2];
    const helperId = parts[3];
    const ticketId = parseInt(parts[4]);
    const ticketType = parts[5] as 'regular' | 'paid';
    
    if (interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ This rating is not for you!", ephemeral: true });
        return;
    }

    const rating = parseInt(interaction.values[0]);
    const modal = createVouchReasonModal(userId, helperId, rating, ticketId, ticketType);
    await interaction.showModal(modal);
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