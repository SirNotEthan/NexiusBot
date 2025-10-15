import { ButtonInteraction, EmbedBuilder, ChannelType, Message, MessageFlags, TextDisplayBuilder, ContainerBuilder } from 'discord.js';
import { VouchTicketData, showTicketForm, createVouchTicket, createGoalModal, createRobloxUsernameModal, createVouchTicketComponents } from '../../commands/vouch/request-carry';
import { cooldownManager } from '../../utils/cooldownManager';
import Database from '../../database/database';
import { safeReply, safeEditReply, safeDeferUpdate, isInteractionValid } from '../../utils/interactionUtils';

/**
 * Get display name for game code
 */
function getGameDisplayName(gameCode: string): string {
    const gameNames: { [key: string]: string } = {
        'als': 'Anime Last Stand',
        'av': 'Anime Vanguards'
    };
    return gameNames[gameCode] || gameCode.toUpperCase();
}

/**
 * Parse ticket data from message and interaction context
 * Same logic as in select menu handler
 */
function parseTicketDataFromInteraction(interaction: ButtonInteraction): VouchTicketData {
    const ticketData: VouchTicketData = { type: 'regular' };

    try {
        // Enhanced Components V2 parsing - look at the full message structure
        const fullContent = JSON.stringify(interaction.message, null, 0);
        console.log('[PARSE_DEBUG] Full message JSON length:', fullContent.length);

        // Parse type from Components V2 content
        if (fullContent.includes('Request Regular Help') || fullContent.includes('Regular')) {
            ticketData.type = 'regular';
        } else if (fullContent.includes('Request Paid Help') || fullContent.includes('Paid')) {
            ticketData.type = 'paid';
        }

        // Parse game from Components V2 content - look for exact display names
        if (fullContent.includes('Anime Last Stand')) {
            ticketData.game = 'als';
        } else if (fullContent.includes('Anime Vanguard')) {
            ticketData.game = 'av';
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

        console.log('[PARSE_DEBUG] Parsed ticket data:', {
            type: ticketData.type,
            game: ticketData.game,
            gamemode: ticketData.gamemode,
            goal: ticketData.goal ? `${ticketData.goal.substring(0, 50)}...` : undefined,
            canJoinLinks: ticketData.canJoinLinks,
            selectedHelper: ticketData.selectedHelper,
            robloxUsername: ticketData.robloxUsername
        });

    } catch (error) {
        console.error('[PARSE_DEBUG] Error parsing Components V2:', error);

        // Fallback: try to get game from custom ID if available
        const customIdParts = interaction.customId.split('_');
        if (customIdParts.length > 2) {
            const gameFromId = customIdParts[customIdParts.length - 1];
            if (gameFromId === 'av' || gameFromId === 'als') {
                ticketData.game = gameFromId;
            }
        }
    }

    return ticketData;
}


export async function handleVouchTicketButtons(interaction: ButtonInteraction): Promise<void> {
    // Check if interaction is still valid
    if (!isInteractionValid(interaction)) {
        console.warn('Button interaction expired, cannot process');
        return;
    }

    const customIdParts = interaction.customId.split('_');
    const action = customIdParts[2]; // request_carry_goal, request_carry_links, etc.
    const userId = customIdParts[customIdParts.length - 1];

    if (interaction.user.id !== userId) {
        await safeReply(interaction, { content: "❌ This button is not for you!", flags: MessageFlags.Ephemeral });
        return;
    }

    // Parse ticket data using the enhanced parsing logic
    const ticketData = parseTicketDataFromInteraction(interaction);

    switch (action) {
        case 'goal':
            const modal = createGoalModal(userId);
            await interaction.showModal(modal);
            break;
        case 'links':
            const linksValue = customIdParts[3] === 'yes';
            ticketData.canJoinLinks = linksValue;
            // Clear helper data when user selects they can join links
            if (linksValue) {
                ticketData.robloxUsername = undefined;
            }
            await updateVouchTicketEmbed(interaction, ticketData);
            break;
        case 'helper':
            // Clear canJoinLinks when user selects to add helper
            ticketData.canJoinLinks = false;
            const robloxModal = createRobloxUsernameModal(userId);
            await interaction.showModal(robloxModal);
            break;
        case 'submit':
            // Check if user can join links OR has provided a helper
            const hasLinkChoice = ticketData.canJoinLinks === true;
            const hasHelper = !!ticketData.robloxUsername;
            const hasValidLinkPreference = hasLinkChoice || hasHelper;

            if (!ticketData.gamemode || !ticketData.goal || !hasValidLinkPreference || !ticketData.game) {
                const missingFields = [];
                if (!ticketData.game) missingFields.push('Game');
                if (!ticketData.gamemode) missingFields.push('Gamemode');
                if (!ticketData.goal) missingFields.push('Goal');
                if (!hasValidLinkPreference) missingFields.push('Links preference or helper information');

                await safeReply(interaction, {
                    content: `❌ **Missing Information**\n\nPlease complete these fields first:\n• ${missingFields.join('\n• ')}\n\n*Fill out the form above and try again.*`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (cooldownManager.isOnCooldown(interaction.user.id, 'carry_request')) {
                const remainingTime = cooldownManager.getRemainingCooldown(interaction.user.id, 'carry_request');
                const timeString = cooldownManager.formatRemainingTime(remainingTime);

                await interaction.update({
                    content: `⏰ **Cooldown Active**\n\nYou must wait **${timeString}** before creating another carry request.\n\n*This prevents spam and helps us manage requests efficiently.*`,
                    components: []
                });
                return;
            }

            // Note: Free carry system has been removed - all tickets are now regular tickets

            await createAndShowVouchTicket(interaction, ticketData);
            break;
        case 'cancel':
            await cancelVouchTicket(interaction);
            break;
    }
}

async function updateVouchTicketEmbed(interaction: any, ticketData: VouchTicketData): Promise<void> {
    if (!isInteractionValid(interaction)) {
        console.warn('Interaction expired, skipping embed update');
        return;
    }

    // Create the updated components
    const components = createVouchTicketComponents(ticketData, interaction.user.id);

    // Update the existing message instead of creating a new one
    await interaction.update({
        components: components,
        flags: MessageFlags.IsComponentsV2
    });
}

async function createAndShowVouchTicket(interaction: ButtonInteraction, ticketData: VouchTicketData): Promise<void> {
    try {
        if (!isInteractionValid(interaction)) {
            console.warn('Interaction expired, cannot create ticket');
            return;
        }

        const guild = interaction.guild;
        if (!guild) {
            await safeReply(interaction, { content: "❌ This command can only be used in a server!", ephemeral: true });
            return;
        }

        // Convert to proper format - ensure required fields
        if (!ticketData.game) {
            await safeReply(interaction, { content: "❌ Game not specified!", flags: MessageFlags.Ephemeral });
            return;
        }

        const channelId = await createVouchTicket(guild, ticketData as any, interaction.user.id, interaction.user.tag);

        cooldownManager.setCooldown(interaction.user.id, 'carry_request');

        const gameDisplay = getGameDisplayName(ticketData.game!);

        // Create success message container
        const successContainer = new ContainerBuilder()
            .setAccentColor(0x00FF00);
        if (!(successContainer as any).components) {
            (successContainer as any).components = [];
        }

        const successText = new TextDisplayBuilder()
            .setContent(`**🎫 Help Request Ticket Created**\n\nYour **${ticketData.type}** help request ticket for **${gameDisplay}** has been created\n\n**Your Ticket Channel:** <#${channelId}>\n\n**What happens next?**\n• Helpers will see your request\n• Someone will claim your ticket\n• They will help you complete your goal\n\n**Cooldown:** You can create another request after 10 mins of vouching the person who helped you`);
        (successContainer as any).components.push(successText);

        // Update the existing message with the success container
        await interaction.update({
            content: null,
            embeds: [],
            components: [successContainer],
            flags: MessageFlags.IsComponentsV2
        });

    } catch (error) {
        console.error('Error creating carry request:', error);

        // Note: Free carry slot reservation system has been removed

        if (isInteractionValid(interaction)) {
            await safeReply(interaction, { content: "❌ Failed to create carry request. Please try again.", flags: MessageFlags.Ephemeral });
        }
    }
}

async function cancelVouchTicket(interaction: ButtonInteraction): Promise<void> {
    if (!isInteractionValid(interaction)) {
        console.warn('Interaction expired, cannot cancel ticket');
        return;
    }

    // Use Components V2 format instead of embeds
    const components = [];
    const mainContainer = new ContainerBuilder();
    if (!(mainContainer as any).components) {
        (mainContainer as any).components = [];
    }

    const cancelText = new TextDisplayBuilder()
        .setContent(`Request Cancelled`);
    (mainContainer as any).components.push(cancelText);

    components.push(mainContainer);

    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    await safeEditReply(interaction, {
        components,
        flags: MessageFlags.IsComponentsV2
    });
}