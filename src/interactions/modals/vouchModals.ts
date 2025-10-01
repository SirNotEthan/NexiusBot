import { ModalSubmitInteraction, EmbedBuilder, ChannelType, MessageFlags } from 'discord.js';
import { VouchTicketData } from '../../commands/vouch/request-carry';
import { processVouch } from '../../commands/vouch/vouch';
import { processBioSetting } from '../../commands/vouch/tracker';

function parseTicketDataFromComponents(interaction: ModalSubmitInteraction): VouchTicketData {
    const ticketData: VouchTicketData = { type: 'regular' };

    try {
        // Enhanced Components V2 parsing - look at the full message structure
        const fullContent = JSON.stringify(interaction.message, null, 0);
        console.log('[MODAL_PARSE_DEBUG] Full message JSON length:', fullContent.length);

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

        console.log('[MODAL_PARSE_DEBUG] Parsed ticket data:', ticketData);

    } catch (error) {
        console.error('[MODAL_PARSE_DEBUG] Error parsing Components V2:', error);

        // Fallback: try to get game from custom ID if available
        const customIdParts = interaction.customId.split('_');
        if (customIdParts.length > 3) {
            const gameFromId = customIdParts[3];
            if (gameFromId === 'av' || gameFromId === 'als') {
                ticketData.game = gameFromId;
            }
        }
    }

    return ticketData;
}

export async function handleVouchGoalModal(interaction: ModalSubmitInteraction): Promise<void> {
    const goal = interaction.fields.getTextInputValue('goal');
    const userId = interaction.customId.split('_')[4]; // request_carry_goal_modal_${userId}
    
    if (interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ This modal is not for you!", flags: MessageFlags.Ephemeral });
        return;
    }

    // Parse current ticket data from components
    const ticketData = parseTicketDataFromComponents(interaction);
    
    // Set the goal from the modal input
    ticketData.goal = goal;

    await updateVouchTicketEmbed(interaction, ticketData);
}

export async function handleRobloxUsernameModal(interaction: ModalSubmitInteraction): Promise<void> {
    const robloxUsername = interaction.fields.getTextInputValue('robloxUsername');
    const userId = interaction.customId.split('_')[4]; // request_carry_roblox_modal_${userId}

    if (interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ This modal is not for you!", flags: MessageFlags.Ephemeral });
        return;
    }

    // Parse current ticket data from components
    const ticketData = parseTicketDataFromComponents(interaction);

    // Set the ROBLOX username from the modal input
    ticketData.robloxUsername = robloxUsername;
    // When someone adds a helper, they can't join links themselves
    ticketData.canJoinLinks = false;

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
        await interaction.reply({ content: "❌ This vouch is not for you!", flags: MessageFlags.Ephemeral });
        return;
    }

    const reason = interaction.fields.getTextInputValue('reason');
    const compensation = interaction.fields.getTextInputValue('compensation') || undefined;

    try {
        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply({ content: "❌ This command can only be used in a server!", flags: MessageFlags.Ephemeral });
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
        await interaction.reply({ content: "❌ Failed to process vouch. Please try again.", flags: MessageFlags.Ephemeral });
    }
}

export async function handlePaidBioModal(interaction: ModalSubmitInteraction): Promise<void> {
    const userId = interaction.customId.split('_')[3];
    
    if (interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ This bio form is not for you!", flags: MessageFlags.Ephemeral });
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

        await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });

    } catch (error) {
        console.error('Error setting paid bio:', error);
        await interaction.reply({ content: "❌ Failed to set bio. Please try again.", flags: MessageFlags.Ephemeral });
    }
}

async function updateVouchTicketEmbed(interaction: any, ticketData: VouchTicketData): Promise<void> {
    try {
        const { createVouchTicketComponents } = await import('../../commands/vouch/request-carry');
        
        const components = createVouchTicketComponents(ticketData, interaction.user.id);

        // Immediately acknowledge the interaction to prevent timeout
        await interaction.deferUpdate();
        
        // Then edit the reply with updated components
        await interaction.editReply({
            components: components,
            flags: MessageFlags.IsComponentsV2
        });
    } catch (error) {
        console.error('Error updating vouch ticket embed from modal:', error);
        // If the interaction hasn't been responded to yet, try to respond with an error
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({
                    content: '❌ Failed to update form. Please try again.',
                    flags: MessageFlags.Ephemeral
                });
            } catch (replyError) {
                console.error('Failed to send error reply:', replyError);
            }
        }
    }
}