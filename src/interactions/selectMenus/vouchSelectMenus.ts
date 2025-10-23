import { StringSelectMenuInteraction, EmbedBuilder, Message, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } from 'discord.js';
import { VouchTicketData, showTicketForm, createVouchTicketComponents } from '../../commands/vouch/request-carry';
import { createVouchReasonModal, processVouch } from '../../commands/vouch/vouch';

function parseTicketDataFromInteraction(interaction: StringSelectMenuInteraction): VouchTicketData {
    const ticketData: VouchTicketData = { type: 'regular' };

    try {
        
        const fullContent = JSON.stringify(interaction.message, null, 0);
        console.log('[SELECT_PARSE_DEBUG] Full message JSON length:', fullContent.length);

        const customIdParts = interaction.customId.split('_');
        if (customIdParts.length > 3) {
            const gameFromId = customIdParts[customIdParts.length - 1];
            if (gameFromId === 'av' || gameFromId === 'als' || gameFromId === 'ac') {
                ticketData.game = gameFromId;
            }
        }

        if (fullContent.includes('Request Regular Help') || fullContent.includes('Regular')) {
            ticketData.type = 'regular';
        } else if (fullContent.includes('Request Paid Help') || fullContent.includes('Paid')) {
            ticketData.type = 'paid';
        }

        if (!ticketData.game) {
            if (fullContent.includes('Anime Last Stand')) {
                ticketData.game = 'als';
            } else if (fullContent.includes('Anime Vanguards')) {
                ticketData.game = 'av';
            } else if (fullContent.includes('Anime Crusaders')) {
                ticketData.game = 'ac';
            }
        }

        const gamemodeMatch = fullContent.match(/\*\*Gamemode\*\*\\n\`\`([^`]+)\`\`/);
        if (gamemodeMatch && gamemodeMatch[1]) {
            ticketData.gamemode = gamemodeMatch[1].trim();
        }

        // Parse goal from Components V2 content - look for goal value
        const goalMatch = fullContent.match(/\*\*What do you need help with\?\*\*\\n\`\`([^`]+)\`\`/);
        if (goalMatch && goalMatch[1]) {
            ticketData.goal = goalMatch[1].trim();
        }

        if (fullContent.includes('Yes - I can join links')) {
            ticketData.canJoinLinks = true;
        } else if (fullContent.includes('No - I cannot join links')) {
            ticketData.canJoinLinks = false;
        }

        const helperMatch = fullContent.match(/\*\*Selected Helper\*\*\\n\`\`<@(\d+)>\`\`/);
        if (helperMatch && helperMatch[1]) {
            ticketData.selectedHelper = helperMatch[1];
        }

        const robloxMatch = fullContent.match(/\*\*ROBLOX Username\*\*\\n\`\`\`([^`]+)\`\`\`/) ||
                           fullContent.match(/\*\*ROBLOX Username\*\*\\n\`\`([^`]+)\`\`/);
        if (robloxMatch && robloxMatch[1]) {
            ticketData.robloxUsername = robloxMatch[1].trim();
        }

        console.log('[SELECT_PARSE_DEBUG] Parsed ticket data:', ticketData);

    } catch (error) {
        console.error('[SELECT_PARSE_DEBUG] Error parsing Components V2:', error);

        const customIdParts = interaction.customId.split('_');
        if (customIdParts.length > 3) {
            const gameFromId = customIdParts[customIdParts.length - 1];
            if (gameFromId === 'av' || gameFromId === 'als' || gameFromId === 'ac') {
                ticketData.game = gameFromId;
            }
        }
    }

    return ticketData;
}

export async function handleVouchGamemodeSelection(interaction: StringSelectMenuInteraction): Promise<void> {
    const customIdParts = interaction.customId.split('_');
    
    const userId = customIdParts[3];
    const game = customIdParts[4]; 

    console.log('[SELECT_DEBUG] CustomId:', interaction.customId);
    console.log('[SELECT_DEBUG] Parsed userId:', userId, 'Actual userId:', interaction.user.id);
    console.log('[SELECT_DEBUG] Game:', game);

    if (interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ This menu is not for you!", flags: MessageFlags.Ephemeral });
        return;
    }

    const selectedGamemode = interaction.values[0];
    
    const ticketData = parseTicketDataFromInteraction(interaction);
    
    if (game) {
        ticketData.game = game;
    }
    
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

export async function handleVouchTicketSelection(interaction: StringSelectMenuInteraction): Promise<void> {
    const parts = interaction.customId.split('_');
    
    const userId = parts[3];
    const helperId = parts[4];

    if (interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ This selection is not for you!", flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferUpdate();

    const ticketNumber = interaction.values[0];

    try {
        const Database = (await import('../../database/database')).default;
        const db = new Database();
        await db.connect();

        try {
            const ticket = await db.getTicket(ticketNumber);
            if (!ticket) {
                await interaction.followUp({
                    content: "❌ **Ticket not found.**",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const helper = await interaction.client.users.fetch(helperId);

            const embed = new EmbedBuilder()
                .setTitle("⭐ Rate Your Experience")
                .setDescription(`How would you rate the help you received from **${helper.tag}** on ticket #${ticketNumber}?\n\nSelect a rating from 1-5 stars:`)
                .setColor(0x5865f2);

            const ratingOptions = [
                { label: '⭐ 1 Star - Poor', value: '1', description: 'Very unsatisfied with the help' },
                { label: '⭐⭐ 2 Stars - Below Average', value: '2', description: 'Unsatisfied with the help' },
                { label: '⭐⭐⭐ 3 Stars - Average', value: '3', description: 'Neutral about the help' },
                { label: '⭐⭐⭐⭐ 4 Stars - Good', value: '4', description: 'Satisfied with the help' },
                { label: '⭐⭐⭐⭐⭐ 5 Stars - Excellent', value: '5', description: 'Very satisfied with the help' }
            ];

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`vouch_rating_${userId}_${helperId}_${ticket.id}_${ticket.type}`)
                .setPlaceholder('Choose a rating...')
                .addOptions(ratingOptions.map(option =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(option.label)
                        .setValue(option.value)
                        .setDescription(option.description)
                ));

            const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });

        } finally {
            await db.close();
        }
    } catch (error) {
        console.error('Error handling ticket selection:', error);
        await interaction.followUp({
            content: "❌ **Failed to process selection.** Please try again.",
            flags: MessageFlags.Ephemeral
        });
    }
}

export async function handleVouchRatingSelection(interaction: StringSelectMenuInteraction): Promise<void> {
    const parts = interaction.customId.split('_');
    const userId = parts[2];
    const helperId = parts[3];
    const ticketIdString = parts[4]; 
    const ticketType = parts[5] as 'regular' | 'paid';

    console.log('[VOUCH_RATING_DEBUG] CustomId:', interaction.customId);
    console.log('[VOUCH_RATING_DEBUG] Parsed userId:', userId);
    console.log('[VOUCH_RATING_DEBUG] Parsed helperId:', helperId);
    console.log('[VOUCH_RATING_DEBUG] Parsed ticketIdString:', ticketIdString);
    console.log('[VOUCH_RATING_DEBUG] Parsed ticketType:', ticketType);

    if (interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ This rating is not for you!", flags: MessageFlags.Ephemeral });
        return;
    }

    const ticketId = parseInt(ticketIdString);

    console.log('[VOUCH_RATING_DEBUG] Final ticketId:', ticketId);

    if (isNaN(ticketId)) {
        console.error('[VOUCH_RATING_DEBUG] Invalid ticket ID parsed:', ticketIdString);
        await interaction.reply({
            content: "❌ Failed to process rating. Invalid ticket ID.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const rating = parseInt(interaction.values[0]);

    try {
        
        const modal = createVouchReasonModal(userId, helperId, rating, ticketId, ticketType);
        await interaction.showModal(modal);
    } catch (error) {
        console.error('[VOUCH_RATING_DEBUG] Error showing modal:', error);
        
        try {
            await interaction.reply({
                content: "❌ Failed to show rating form. Please try again.",
                flags: MessageFlags.Ephemeral
            });
        } catch (replyError) {
            console.error('[VOUCH_RATING_DEBUG] Could not send error reply:', replyError);
        }
    }
}

async function updateVouchTicketEmbed(interaction: any, ticketData: VouchTicketData): Promise<void> {
    try {
        
        const components = createVouchTicketComponents(ticketData, interaction.user.id);
        
        await interaction.deferUpdate();
        
        await interaction.editReply({
            components: components,
            flags: MessageFlags.IsComponentsV2
        });
    } catch (error) {
        console.error('Error updating vouch ticket embed:', error);
        
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({
                    content: '❌ Failed to update form. Please try again.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('Failed to send error reply:', replyError);
            }
        }
    }
}