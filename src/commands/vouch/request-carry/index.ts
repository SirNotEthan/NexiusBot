import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    MessageFlags
} from 'discord.js';
import { RequestCarryData, RequestCarryBuilderFactory } from './builders/RequestCarryBuilder';
import { RequestCarryButtonHandler } from './handlers/ButtonHandler';
import { RequestCarryUtils } from './utils/RequestCarryUtils';
import { cooldownManager } from '../../../utils/cooldownManager';
import { isInteractionValid, safeReply, safeDeferReply } from '../../../utils/interactionUtils';

/**
 * Modern request-carry command implementation
 * Uses Components V2 with improved UX and modular structure
 */

const data = new SlashCommandBuilder()
    .setName("request-carry")
    .setDescription("Request a carry for help with modern Components V2 interface")
    .addStringOption(option =>
        option.setName('type')
            .setDescription('Type of carry to request')
            .setRequired(true)
            .addChoices(
                { name: 'Regular Help', value: 'regular' },
                { name: 'Paid Help', value: 'paid' }
            )
    )
    .addStringOption(option =>
        option.setName('game')
            .setDescription('Which game you need help with')
            .setRequired(true)
            .addChoices(
                { name: 'Anime Last Stand', value: 'als' },
                { name: 'Anime Vanguards', value: 'av' }
            )
    );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        // Validate interaction
        if (!isInteractionValid(interaction)) {
            console.warn('Interaction expired, cannot process carry request');
            return;
        }

        // Check cooldown
        if (cooldownManager.isOnCooldown(interaction.user.id, 'carry_request')) {
            const remainingTime = cooldownManager.getRemainingCooldown(interaction.user.id, 'carry_request');
            const timeString = cooldownManager.formatRemainingTime(remainingTime);
            
            await safeReply(interaction, {
                content: `⏰ **Please wait ${timeString}** before creating another carry request.\n\n*This prevents request spam and helps us manage the queue efficiently.*`,
                ephemeral: true
            });
            return;
        }

        // Get command options
        const ticketType = interaction.options.getString('type', true) as 'regular' | 'paid';
        const game = interaction.options.getString('game', true);

        // Check if paid help is available
        if (ticketType === 'paid') {
            await safeReply(interaction, {
                content: `🚫 **Paid Help is currently disabled.**\n\nPaid tickets are temporarily unavailable while we work on improvements. Please use **Regular Help** instead or try again later.\n\n*Thank you for your understanding!*`,
                ephemeral: true
            });
            return;
        }

        // Defer reply for processing
        const deferred = await safeDeferReply(interaction, { ephemeral: true });
        if (!deferred) return;

        // Create initial request data
        const requestData: RequestCarryData = {
            type: ticketType,
            game: game
        };

        // Initialize session data
        RequestCarryButtonHandler.setSessionData(interaction.user.id, requestData);

        // Check initial eligibility for regular carries
        if (ticketType === 'regular') {
            // We'll show a warning if they might not be eligible, but let them continue
            // The final check will be done at submission
            const messageStats = await checkUserMessages(interaction.user.id);
            if (messageStats < 50) {
                // Show warning but allow to continue
                await interaction.editReply({
                    content: `⚠️ **Message Activity Warning**\n\nYou currently have ${messageStats} messages today. You need at least 50 messages to be eligible for free carries.\n\nYou can continue filling out the form, but you'll need to send more messages before submitting.`
                });
                
                // Wait a moment for user to read the warning
                setTimeout(async () => {
                    await showRequestForm(interaction, requestData);
                }, 3000);
                return;
            }
        }

        // Show the request form
        await showRequestForm(interaction, requestData);

        // Set cooldown after successful form display
        cooldownManager.setCooldown(interaction.user.id, 'carry_request');

    } catch (error) {
        console.error("Error in request-carry command:", error);
        await handleCommandError(interaction, error);
    }
}

/**
 * Show the request form interface
 */
async function showRequestForm(interaction: ChatInputCommandInteraction, requestData: RequestCarryData): Promise<void> {
    try {
        // Create the modern Components V2 interface
        const builder = RequestCarryBuilderFactory.createWithData(requestData, interaction.user.id, true);
        const response = builder.build();

        await interaction.editReply({
            components: response.components,
            flags: MessageFlags.IsComponentsV2
        });
    } catch (error) {
        console.error('Error showing request form:', error);
        throw error;
    }
}

/**
 * Check user message count for eligibility
 */
async function checkUserMessages(userId: string): Promise<number> {
    try {
        const Database = (await import('../../../database/database')).default;
        const db = new Database();
        await db.connect();
        
        try {
            const messageStats = await db.getUserMessageStats(userId);
            return messageStats?.message_count || 0;
        } finally {
            await db.close();
        }
    } catch (error) {
        console.error('Error checking user messages:', error);
        return 0; // Assume no messages on error
    }
}

/**
 * Handle command errors
 */
async function handleCommandError(interaction: ChatInputCommandInteraction, error: any): Promise<void> {
    console.error("Request-carry command error:", error);
    
    if (!isInteractionValid(interaction)) {
        console.warn('Interaction expired, cannot send error message');
        return;
    }
    
    try {
        const errorMessage = "❌ Failed to create carry request form. Please try again later.";
        
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content: errorMessage });
        } else {
            await safeReply(interaction, { content: errorMessage, ephemeral: true });
        }
    } catch (followUpError) {
        console.error("Failed to send command error message:", followUpError);
    }
}

export default { data, execute };

// Export handlers for the interaction router
export { RequestCarryButtonHandler } from './handlers/ButtonHandler';
export { RequestCarryModalHandler } from './handlers/ModalHandler';
export { RequestCarrySelectMenuHandler } from './handlers/SelectMenuHandler';
export { RequestCarryUtils } from './utils/RequestCarryUtils';