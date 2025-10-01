import { StringSelectMenuInteraction, EmbedBuilder, Message, MessageFlags } from 'discord.js';
import { VouchTicketData, showTicketForm, createVouchTicketComponents } from '../../commands/vouch/request-carry';
import { createVouchReasonModal, processVouch } from '../../commands/vouch/vouch';

/**
 * Parse ticket data from message and interaction context
 * Since Components V2 data isn't easily parseable, we'll use a simpler approach
 */
function parseTicketDataFromInteraction(interaction: StringSelectMenuInteraction): VouchTicketData {
    const ticketData: VouchTicketData = { type: 'regular' };

    try {
        // Enhanced Components V2 parsing - look at the full message structure
        const fullContent = JSON.stringify(interaction.message, null, 0);
        console.log('[SELECT_PARSE_DEBUG] Full message JSON length:', fullContent.length);

        // Extract game from the custom ID - this is usually reliable for select menus
        const customIdParts = interaction.customId.split('_');
        if (customIdParts.length > 3) {
            const gameFromId = customIdParts[customIdParts.length - 1];
            if (gameFromId === 'av' || gameFromId === 'als') {
                ticketData.game = gameFromId;
            }
        }

        // Parse type from Components V2 content
        if (fullContent.includes('Request Regular Help') || fullContent.includes('Regular')) {
            ticketData.type = 'regular';
        } else if (fullContent.includes('Request Paid Help') || fullContent.includes('Paid')) {
            ticketData.type = 'paid';
        }

        // If game not found in customId, parse from Components V2 content
        if (!ticketData.game) {
            if (fullContent.includes('Anime Last Stand')) {
                ticketData.game = 'als';
            } else if (fullContent.includes('Anime Vanguard')) {
                ticketData.game = 'av';
            }
        }

        // Parse gamemode from Components V2 content - look for gamemode value
        const gamemodeMatch = fullContent.match(/\*\*Gamemode\*\*\\n\`\`([^`]+)\`\`/);
        if (gamemodeMatch && gamemodeMatch[1]) {
            ticketData.gamemode = gamemodeMatch[1].trim();
        }

        // Parse goal from Components V2 content - look for goal value
        const goalMatch = fullContent.match(/\*\*What do you need help with\?\*\*\\n\`\`([^`]+)\`\`/);
        if (goalMatch && goalMatch[1]) {
            ticketData.goal = goalMatch[1].trim();
        }

        // Parse canJoinLinks from Components V2 content - match actual format
        if (fullContent.includes('Yes - I can join links')) {
            ticketData.canJoinLinks = true;
        } else if (fullContent.includes('No - I cannot join links')) {
            ticketData.canJoinLinks = false;
        }

        // Parse selected helper
        const helperMatch = fullContent.match(/\*\*Selected Helper\*\*\\n\`\`<@(\d+)>\`\`/);
        if (helperMatch && helperMatch[1]) {
            ticketData.selectedHelper = helperMatch[1];
        }

        // Parse ROBLOX username
        const robloxMatch = fullContent.match(/\*\*ROBLOX Username\*\*\\n\`\`([^`]+)\`\`/);
        if (robloxMatch && robloxMatch[1]) {
            ticketData.robloxUsername = robloxMatch[1];
        }

        console.log('[SELECT_PARSE_DEBUG] Parsed ticket data:', ticketData);

    } catch (error) {
        console.error('[SELECT_PARSE_DEBUG] Error parsing Components V2:', error);

        // Fallback: try to get game from custom ID
        const customIdParts = interaction.customId.split('_');
        if (customIdParts.length > 3) {
            const gameFromId = customIdParts[customIdParts.length - 1];
            if (gameFromId === 'av' || gameFromId === 'als') {
                ticketData.game = gameFromId;
            }
        }
    }

    return ticketData;
}

export async function handleVouchGamemodeSelection(interaction: StringSelectMenuInteraction): Promise<void> {
    const customIdParts = interaction.customId.split('_');
    // CustomId format: request_carry_gamemode_${userId}_${game}
    // So userId is at index 3, game is at index 4
    const userId = customIdParts[3];
    const game = customIdParts[4]; // Extract game from custom ID

    console.log('[SELECT_DEBUG] CustomId:', interaction.customId);
    console.log('[SELECT_DEBUG] Parsed userId:', userId, 'Actual userId:', interaction.user.id);
    console.log('[SELECT_DEBUG] Game:', game);

    if (interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ This menu is not for you!", flags: MessageFlags.Ephemeral });
        return;
    }

    const selectedGamemode = interaction.values[0];
    
    // Parse ticket data from interaction context
    const ticketData = parseTicketDataFromInteraction(interaction);
    
    // Override game with the one from custom ID (more reliable)
    if (game) {
        ticketData.game = game;
    }
    
    // Set the selected gamemode
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
        await interaction.reply({ content: "❌ This rating is not for you!", flags: MessageFlags.Ephemeral });
        return;
    }

    const rating = parseInt(interaction.values[0]);
    const modal = createVouchReasonModal(userId, helperId, rating, ticketId, ticketType);
    await interaction.showModal(modal);
}

async function updateVouchTicketEmbed(interaction: any, ticketData: VouchTicketData): Promise<void> {
    try {
        // Create the updated components
        const components = createVouchTicketComponents(ticketData, interaction.user.id);
        
        // Immediately acknowledge the interaction to prevent timeout
        await interaction.deferUpdate();
        
        // Then edit the reply with updated components
        await interaction.editReply({
            components: components,
            flags: MessageFlags.IsComponentsV2
        });
    } catch (error) {
        console.error('Error updating vouch ticket embed:', error);
        // If the interaction hasn't been responded to yet, try to respond with an error
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