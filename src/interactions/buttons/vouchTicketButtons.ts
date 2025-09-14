import { ButtonInteraction, EmbedBuilder, ChannelType } from 'discord.js';
import { VouchTicketData, showTicketForm, createVouchTicket, createGoalModal } from '../../commands/vouch/request-carry';
import { cooldownManager } from '../../utils/cooldownManager';
import Database from '../../database/database';
import { getFreeCarryLimit } from '../../config/freeCarriesConfig';
import { safeReply, safeEditReply, safeDeferUpdate, isInteractionValid } from '../../utils/interactionUtils';

async function checkFreeCarryEligibility(userId: string, game: string, gamemode: string): Promise<{eligible: boolean, reason?: string, limit?: number, used?: number}> {
    const db = new Database();
    await db.connect();
    
    try {
        const messageStats = await db.getUserMessageStats(userId);
        
        if (!messageStats) {
            return { eligible: false, reason: 'No message activity found today' };
        }
        
        const hasEnoughMessages = messageStats.message_count >= 50;
        if (!hasEnoughMessages) {
            return { eligible: false, reason: `Need at least 50 messages today (currently ${messageStats.message_count})` };
        }
        
        const gamemodeLimit = getFreeCarryLimit(game, gamemode);
        if (gamemodeLimit === 0) {
            return { eligible: false, reason: 'This gamemode does not support free carries' };
        }
        
        const usage = await db.getFreeCarryUsage(userId, game, gamemode);
        const currentUsage = usage ? usage.usage_count : 0;
        
        const hasRequestsRemaining = currentUsage < gamemodeLimit;
        
        return { 
            eligible: hasRequestsRemaining,
            reason: hasRequestsRemaining ? undefined : `Daily limit reached for this gamemode (${currentUsage}/${gamemodeLimit})`,
            limit: gamemodeLimit,
            used: currentUsage
        };
    } finally {
        await db.close();
    }
}

export async function handleVouchTicketButtons(interaction: ButtonInteraction): Promise<void> {
    const customIdParts = interaction.customId.split('_');
    const action = customIdParts[1];
    const userId = customIdParts[customIdParts.length - 1];
    
    if (interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ This button is not for you!", ephemeral: true });
        return;
    }

    const currentEmbed = interaction.message.embeds[0];
    if (!currentEmbed) {
        await interaction.reply({ content: "❌ Could not find ticket form data.", ephemeral: true });
        return;
    }

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
            case "🎮 Gamemode":
                if (field.value !== "❌ *Not set*") {
                    ticketData.gamemode = field.value.replace(/`/g, '').trim();
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

    switch (action) {
        case 'goal':
            const modal = createGoalModal(userId);
            await interaction.showModal(modal);
            break;
        case 'links':
            const linksValue = customIdParts[2] === 'yes';
            ticketData.canJoinLinks = linksValue;
            await updateVouchTicketEmbed(interaction, ticketData);
            break;
        case 'create':
            if (!ticketData.gamemode || !ticketData.goal || ticketData.canJoinLinks === undefined || !ticketData.game) {
                await interaction.reply({ content: "❌ Please complete all fields first!", ephemeral: true });
                return;
            }
            
            if (cooldownManager.isOnCooldown(interaction.user.id, 'carry_request')) {
                const remainingTime = cooldownManager.getRemainingCooldown(interaction.user.id, 'carry_request');
                const timeString = cooldownManager.formatRemainingTime(remainingTime);
                
                await interaction.reply({
                    content: `⏰ **Cooldown Active**\n\nYou must wait **${timeString}** before creating another carry request.\n\n*This prevents spam and helps us manage requests efficiently.*`,
                    ephemeral: true
                });
                return;
            }
            
            if (ticketData.type === 'regular') {
                const eligibility = await checkFreeCarryEligibility(interaction.user.id, ticketData.game, ticketData.gamemode);
                if (!eligibility.eligible) {
                    const embed = new EmbedBuilder()
                        .setTitle("❌ Free Carry Limit Reached")
                        .setDescription(`**${eligibility.reason}**\n\nTo create more carry requests for this gamemode today, you need to meet the requirements below.`)
                        .setColor(0xff6b6b)
                        .addFields([
                            { name: "📝 Requirements for Free Carries", value: "• At least 50 messages in the server today\n• Stay within the daily limits for each gamemode", inline: false },
                            { name: "📊 Your Current Usage", value: eligibility.limit !== undefined ? `**${ticketData.gamemode}:** ${eligibility.used}/${eligibility.limit} carries used today` : "No usage data available", inline: false },
                            { name: "💡 Alternatives", value: "• Use **Paid Help** instead\n• Try a different gamemode\n• Wait until tomorrow for your limits to reset", inline: false }
                        ])
                        .setFooter({ text: "Limits reset daily at midnight UTC" })
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                    return;
                }
            }
            
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

    const { createVouchTicketEmbed, createVouchTicketComponents } = require('../../commands/vouch/request-carry');
    
    const embed = createVouchTicketEmbed(ticketData);
    const components = createVouchTicketComponents(ticketData, interaction.user.id);

    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    await safeEditReply(interaction, {
        embeds: [embed],
        components: components
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

        const channelId = await createVouchTicket(guild, ticketData, interaction.user.id, interaction.user.tag);
        
        cooldownManager.setCooldown(interaction.user.id, 'carry_request');
        
        const successEmbed = new EmbedBuilder()
            .setTitle("✅ Carry Request Created!")
            .setDescription(`Your ${ticketData.type} carry request has been created successfully!\n\n📍 Go to <#${channelId}> to get help.\n\n⏰ **Cooldown:** You can create another carry request in 10 minutes.`)
            .setColor(ticketData.type === 'paid' ? 0x00d4aa : 0x5865f2);

        await safeReply(interaction, { embeds: [successEmbed], ephemeral: true });

    } catch (error) {
        console.error('Error creating carry request:', error);
        if (isInteractionValid(interaction)) {
            await safeReply(interaction, { content: "❌ Failed to create carry request. Please try again.", ephemeral: true });
        }
    }
}

async function cancelVouchTicket(interaction: ButtonInteraction): Promise<void> {
    if (!isInteractionValid(interaction)) {
        console.warn('Interaction expired, cannot cancel ticket');
        return;
    }

    const cancelEmbed = new EmbedBuilder()
        .setTitle("❌ Vouch Ticket Cancelled")
        .setDescription("Your vouch ticket creation has been cancelled.")
        .setColor(0xff6b6b);

    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    await safeEditReply(interaction, {
        embeds: [cancelEmbed],
        components: []
    });
}