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
                { name: 'Anime Vanguards', value: 'av' },
                { name: 'Anime Crusaders', value: 'ac' }
            )
    );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        
        if (!isInteractionValid(interaction)) {
            console.warn('Interaction expired, cannot process carry request');
            return;
        }

        const blacklistRoleId = process.env.TICKET_BLACKLIST_ROLE_ID;
        if (blacklistRoleId && interaction.member && typeof interaction.member !== 'string' && 'roles' in interaction.member) {
            const roleManager = interaction.member.roles;
            if (roleManager && typeof roleManager === 'object' && 'cache' in roleManager) {
                if (roleManager.cache.has(blacklistRoleId)) {
                    await safeReply(interaction, {
                        content: '🚫 **Access Denied**\n\nYou are currently blacklisted from creating carry request tickets. If you believe this is a mistake, please contact a staff member.',
                        ephemeral: true
                    });
                    return;
                }
            }
        }

        if (cooldownManager.isOnCooldown(interaction.user.id, 'carry_request')) {
            const remainingTime = cooldownManager.getRemainingCooldown(interaction.user.id, 'carry_request');
            const timeString = cooldownManager.formatRemainingTime(remainingTime);
            
            await safeReply(interaction, {
                content: `⏰ **Please wait ${timeString}** before creating another carry request.\n\n*This prevents request spam and helps us manage the queue efficiently.*`,
                ephemeral: true
            });
            return;
        }

        const ticketType = interaction.options.getString('type', true) as 'regular' | 'paid';
        const game = interaction.options.getString('game', true);

        const deferred = await safeDeferReply(interaction, { ephemeral: true });
        if (!deferred) return;

        const requestData: RequestCarryData = {
            type: ticketType,
            game: game
        };

        RequestCarryButtonHandler.setSessionData(interaction.user.id, requestData);

        if (ticketType === 'regular') {
            
            const messageStats = await checkUserMessages(interaction.user.id);
            if (messageStats < 50) {
                await interaction.editReply({
                    content: `❌ **Message Requirement Not Met**\n\nYou currently have **${messageStats}** messages today. You need at least **50 messages** to request a free carry.\n\n*Send more messages in the server and try again!*`
                });
                return;
            }
        }

        await showRequestForm(interaction, requestData);

        cooldownManager.setCooldown(interaction.user.id, 'carry_request');

    } catch (error) {
        console.error("Error in request-carry command:", error);
        await handleCommandError(interaction, error);
    }
}

async function showRequestForm(interaction: ChatInputCommandInteraction, requestData: RequestCarryData): Promise<void> {
    try {
        
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
        return 0; 
    }
}

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

export { RequestCarryButtonHandler } from './handlers/ButtonHandler';
export { RequestCarryModalHandler } from './handlers/ModalHandler';
export { RequestCarrySelectMenuHandler } from './handlers/SelectMenuHandler';
export { RequestCarryUtils } from './utils/RequestCarryUtils';