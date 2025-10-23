import { ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, TextChannel, AttachmentBuilder, ChannelType, MessageFlags, ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import type { Message } from 'discord.js';
import { getDatabase } from '../../database';
import { getGameDisplayName } from '../../config/freeCarriesConfig';
import { botLogger } from '../../utils/logger';

function hasHelperRole(member: any, game?: string): boolean {
    if (game) {
        const gameHelperRoleId = getGameHelperRoleId(game);
        if (gameHelperRoleId && member.roles.cache.has(gameHelperRoleId)) {
            return true;
        }
    }
    
    const helperRoleIds = process.env.HELPER_ROLE_IDS?.split(',') || [];
    return helperRoleIds.some(roleId => member.roles.cache.has(roleId.trim()));
}

function getGameHelperRoleId(game: string): string | undefined {
    const gamePrefix = game.toUpperCase();
    const envVar = `${gamePrefix}_HELPER_ROLE_ID`;

    return process.env[envVar];
}

function capitalizeFirstLetter(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function getGameTranscriptChannelId(game: string, type: 'regular' | 'paid'): string | undefined {
    if (!game || !type) {
        console.warn(' Missing game or type information for transcript channel lookup');
        return undefined;
    }
    
    const gamePrefix = game.toUpperCase();
    const typePrefix = type.toUpperCase();
    const envVar = `${gamePrefix}_${typePrefix}_TRANSCRIPT_CHANNEL_ID`;
    
    return process.env[envVar];
}

export async function handleClaimTicket(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.guild || !interaction.member) {
        await interaction.reply({
            content: "❌ This command can only be used in a server!",
            ephemeral: true
        });
        return;
    }

    const db = getDatabase();
    const ticket = await db.getTicketByChannelId(interaction.channelId);
    
    if (!ticket) {
        await interaction.reply({
            content: "❌ Could not find ticket information in database.",
            ephemeral: true
        });
        return;
    }

    if (ticket.type === 'paid' && ticket.claimed_by) {
        if (interaction.user.id !== ticket.claimed_by) {
            await interaction.reply({
                content: "❌ This paid ticket is assigned to a specific helper. Only they can manage this ticket.",
                ephemeral: true
            });
            return;
        }
    } else if (!hasHelperRole(interaction.member, ticket.game)) {
        await interaction.reply({
            content: `❌ You don't have permission to claim tickets. Only ${getGameDisplayName(ticket.game)} helper roles can claim this ticket.`,
            ephemeral: true
        });
        return;
    }

    if (ticket.status === 'claimed') {
        await interaction.reply({
            content: "❌ This ticket has already been claimed!",
            ephemeral: true
        });
        return;
    }

    if (ticket.status === 'closed') {
        await interaction.reply({
            content: "❌ This ticket is already closed!",
            ephemeral: true
        });
        return;
    }

    let helper = await db.getHelper(interaction.user.id);
    if (!helper) {
        console.log(`[CLAIM_TICKET] Helper ${interaction.user.id} (${interaction.user.tag}) not found in database, creating new helper record...`);
        await db.createHelper({
            user_id: interaction.user.id,
            user_tag: interaction.user.tag,
            helper_rank: 'Helper',
            total_vouches: 0,
            helper_since: Date.now(),
            weekly_vouches: 0,
            monthly_vouches: 0,
            average_rating: 0.0,
            is_paid_helper: false,
            vouches_for_paid_access: 0
        });
        console.log(`[CLAIM_TICKET] Helper ${interaction.user.tag} successfully added to database`);
    }

    await db.claimTicket(ticket.ticket_number, interaction.user.id, interaction.user.tag);

    await botLogger.logTicketClaimed(ticket.ticket_number, interaction.user.id, ticket.user_id);

    const originalMessage = interaction.message;
    
    const originalComponents = originalMessage?.components || [];
    const updatedComponents = [];
    
    for (const component of originalComponents) {
        if (component.type === 1) { 
            continue;
        } else {
            
            const updatedContainer = JSON.parse(JSON.stringify(component));

            if (updatedContainer.components) {
                const originalLength = updatedContainer.components.length;
                updatedContainer.components = updatedContainer.components.filter((comp: any) => comp.type !== 1);
                console.log(`[LEGACY_CLAIM_DEBUG] Filtered action rows: ${originalLength} -> ${updatedContainer.components.length}`);
            }

            let insertIndex = -1;
            for (let i = 0; i < updatedContainer.components.length; i++) {
                const comp = updatedContainer.components[i];
                if (comp.type === 2) { 
                    insertIndex = i + 1;
                    break;
                }
            }

            if (insertIndex > 0) {
                const claimedBySection = {
                    type: 13, 
                    content: `**Claimed by:** ${interaction.user} (\`${interaction.user.tag}\`)`
                };
                updatedContainer.components.splice(insertIndex, 0, claimedBySection);
            }

            if (updatedContainer.components && updatedContainer.components.length > 0) {
                updatedComponents.push(updatedContainer);
                console.log(`[LEGACY_CLAIM_DEBUG] Added container with ${updatedContainer.components.length} components`);
            } else {
                console.warn(`[LEGACY_CLAIM_DEBUG] Skipping empty container`);
            }
        }
    }

    const buttonContainer = new ContainerBuilder();
    if (!(buttonContainer as any).components) {
        (buttonContainer as any).components = [];
    }

    const buttons = [
        new ButtonBuilder()
            .setCustomId(`ring_helper_${ticket.ticket_number}`)
            .setLabel('Ring Helper')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📞'),
        new ButtonBuilder()
            .setCustomId(`unclaim_ticket_${ticket.ticket_number}`)
            .setLabel('Unclaim')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎫'),
        new ButtonBuilder()
            .setCustomId(`close_ticket_${ticket.ticket_number}`)
            .setLabel('Close')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒')
    ];

    console.log(`[LEGACY_CLAIM_DEBUG] Creating button row with ${buttons.length} buttons for claimed ticket #${ticket.ticket_number}`);

    if (buttons.length === 0) {
        console.error(`[LEGACY_CLAIM_DEBUG] No buttons to create for ticket #${ticket.ticket_number}`);
        return;
    }

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
    (buttonContainer as any).components.push(buttonRow);

    console.log(`[LEGACY_CLAIM_DEBUG] Button container has ${(buttonContainer as any).components.length} components`);

    const channel = interaction.channel;
    if (channel && 'permissionOverwrites' in channel) {
        try {
            const helperRoleIds = process.env.HELPER_ROLE_IDS?.split(',') || [];
            const gameHelperRoleId = getGameHelperRoleId(ticket.game);

            const rolesToDeny = [...helperRoleIds];
            if (gameHelperRoleId && !rolesToDeny.includes(gameHelperRoleId)) {
                rolesToDeny.push(gameHelperRoleId);
            }

            for (const roleId of rolesToDeny) {
                if (roleId.trim()) {
                    await channel.permissionOverwrites.edit(roleId.trim(), {
                        ViewChannel: false,
                        SendMessages: false,
                        ReadMessageHistory: false
                    });
                }
            }

            await channel.permissionOverwrites.edit(interaction.user.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                ManageMessages: false
            });

            const managerRoleIds = process.env.MANAGER_ROLE_IDS?.split(',') || [];
            for (const roleId of managerRoleIds) {
                if (roleId.trim()) {
                    await channel.permissionOverwrites.edit(roleId.trim(), {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true,
                        ManageMessages: true
                    });
                }
            }

            console.log(` Channel permissions updated - ticket #${ticket.ticket_number} now hidden from other helpers, managers added`);
        } catch (permError) {
            console.warn(' Could not update channel permissions:', permError);
        }
    }

    const claimMessage = `**This ticket has been claimed by ${interaction.user}**\n\nThey will be assisting you with your request.`;

    await interaction.deferUpdate();

    if ((buttonContainer as any).components && (buttonContainer as any).components.length > 0) {
        
        let validContainer = true;
        (buttonContainer as any).components.forEach((comp: any, index: number) => {
            if (!comp.components || comp.components.length === 0) {
                console.error(`[LEGACY_CLAIM_DEBUG] Button container component ${index} has invalid structure:`, comp);
                validContainer = false;
            }
        });

        if (validContainer) {
            updatedComponents.push(buttonContainer);
            console.log(`[LEGACY_CLAIM_DEBUG] Added valid button container`);
        } else {
            console.error(`[LEGACY_CLAIM_DEBUG] Skipping invalid button container`);
        }
    } else {
        console.error(`[LEGACY_CLAIM_DEBUG] Button container is empty or invalid`);
    }

    console.log(`[LEGACY_CLAIM_DEBUG] Attempting to update message with ${updatedComponents.length} components`);

    const validatedComponents = [];
    updatedComponents.forEach((component, index) => {
        console.log(`[LEGACY_CLAIM_DEBUG] Component ${index}:`, {
            type: component.type,
            hasComponents: !!component.components,
            componentsLength: component.components?.length || 0,
            componentTypes: component.components?.map((c: any) => ({ type: c.type, hasComponents: !!c.components, componentsLength: c.components?.length })) || []
        });

        if (component.components && component.components.length > 0) {
            
            const validSubComponents = component.components.every((subComp: any) => {
                if (subComp.type === 1) { 
                    return subComp.components && subComp.components.length > 0 && subComp.components.length <= 5;
                }
                return true; 
            });

            if (validSubComponents) {
                validatedComponents.push(component);
                console.log(`[LEGACY_CLAIM_DEBUG] Component ${index} is valid`);
            } else {
                console.error(`[LEGACY_CLAIM_DEBUG] Component ${index} has invalid sub-components, skipping`);
            }
        } else {
            console.error(`[LEGACY_CLAIM_DEBUG] Component ${index} has no components, skipping`);
        }
    });

    console.log(`[LEGACY_CLAIM_DEBUG] Final component count: ${validatedComponents.length} (originally ${updatedComponents.length})`);

    try {
        await interaction.editReply({
            components: validatedComponents,
            flags: MessageFlags.IsComponentsV2
        });

        console.log(`[LEGACY_CLAIM_DEBUG] Successfully updated message for ticket #${ticket.ticket_number}`);

        await interaction.followUp({
            content: claimMessage,
            ephemeral: false
        });

    } catch (updateError) {
        console.error(`[LEGACY_CLAIM_DEBUG] Error updating message for ticket #${ticket.ticket_number}:`, updateError);

        try {
            await interaction.followUp({
                content: `❌ **Error updating message, but ticket #${ticket.ticket_number} has been claimed successfully.**\n\n${claimMessage}`,
                ephemeral: false
            });
        } catch (followUpError) {
            console.error(`[LEGACY_CLAIM_DEBUG] Error sending follow-up:`, followUpError);
        }
    }
}

export async function handleEditTicket(interaction: ButtonInteraction): Promise<void> {
    const db = getDatabase();
    const ticket = await db.getTicketByChannelId(interaction.channelId);
    
    if (!ticket) {
        await interaction.reply({
            content: "❌ Could not find ticket information in database.",
            ephemeral: true
        });
        return;
    }

    if (ticket.status === 'closed') {
        await interaction.reply({
            content: "❌ This ticket is already closed and cannot be edited!",
            ephemeral: true
        });
        return;
    }

    const isOwner = ticket.user_id === interaction.user.id;
    const isClaimer = ticket.claimed_by === interaction.user.id;
    
    if (!isOwner && !isClaimer) {
        await interaction.reply({
            content: "❌ You don't have permission to edit this ticket. Only the ticket creator or the helper who claimed it can edit this ticket.",
            ephemeral: true
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId('edit_ticket_modal')
        .setTitle(`Edit Ticket #${ticket.ticket_number}`);

    const gamemodeInput = new TextInputBuilder()
        .setCustomId('edit_gamemode')
        .setLabel('Gamemode')
        .setStyle(TextInputStyle.Short)
        .setValue(capitalizeFirstLetter(ticket.gamemode))
        .setRequired(true)
        .setMaxLength(100);

    const goalInput = new TextInputBuilder()
        .setCustomId('edit_goal')
        .setLabel('Goal/Objective')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(ticket.goal)
        .setRequired(true)
        .setMaxLength(500);

    const contactInput = new TextInputBuilder()
        .setCustomId('edit_contact')
        .setLabel('Contact Information')
        .setStyle(TextInputStyle.Short)
        .setValue(ticket.contact)
        .setRequired(true)
        .setMaxLength(200);

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(gamemodeInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(goalInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(contactInput)
    );

    await interaction.showModal(modal);
}

export async function handleCloseTicket(interaction: ButtonInteraction): Promise<void> {
    const db = getDatabase();
    const ticket = await db.getTicketByChannelId(interaction.channelId);
    
    if (!ticket) {
        await interaction.reply({
            content: "❌ Could not find ticket information in database.",
            ephemeral: true
        });
        return;
    }

    if (ticket.status === 'closed') {
        await interaction.reply({
            content: "❌ This ticket is already closed!",
            ephemeral: true
        });
        return;
    }

    const isOwner = ticket.user_id === interaction.user.id;
    const isHelper = interaction.member && hasHelperRole(interaction.member, ticket.game);

    if (ticket.type === 'paid' && ticket.claimed_by) {
        const isAssignedHelper = interaction.user.id === ticket.claimed_by;
        if (!isOwner && !isAssignedHelper) {
            await interaction.reply({
                content: "❌ You don't have permission to close this paid ticket. Only the ticket owner or assigned helper can close it.",
                ephemeral: true
            });
            return;
        }

        if (isOwner && !isAssignedHelper && ticket.claimed_by) {
            await showHelperAuthorizationPrompt(interaction, ticket);
            return;
        }
    } else if (!isOwner && !isHelper) {
        await interaction.reply({
            content: `❌ You don't have permission to close this ticket. Only the ticket owner or ${getGameDisplayName(ticket.game)} helper roles can close this ticket.`,
            ephemeral: true
        });
        return;
    } else if (isOwner && ticket.claimed_by && interaction.user.id !== ticket.claimed_by) {
        
        await showHelperAuthorizationPrompt(interaction, ticket);
        return;
    }

    await generateAndSendTicketTranscript(interaction, ticket);
    await finalizeTicketClosure(interaction, ticket);
}

async function generateAndSendTicketTranscript(interaction: ButtonInteraction, ticket: any): Promise<void> {
    const transcriptChannelId = getGameTranscriptChannelId(ticket.game, ticket.type);
    
    if (!transcriptChannelId) {
        const channelType = `${ticket.game?.toUpperCase()}_${ticket.type?.toUpperCase()}_TRANSCRIPT_CHANNEL_ID`;
        console.warn(`⚠️ ${channelType} not configured in environment variables`);
        return;
    }

    const guild = interaction.guild;
    if (!guild) return;

    const transcriptChannel = guild.channels.cache.get(transcriptChannelId) as TextChannel;
    if (!transcriptChannel) {
        console.error(' Transcript channel not found or bot lacks access');
        return;
    }

    const ticketChannel = interaction.channel as TextChannel;
    if (!ticketChannel) return;

    try {
        const batch = await ticketChannel.messages.fetch({ limit: 100 });
        const messages = Array.from(batch.values());

        messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        const transcriptContent = await formatTranscript(ticket, messages, interaction.user);

        const transcriptBuffer = Buffer.from(transcriptContent, 'utf-8');
        const attachment = new AttachmentBuilder(transcriptBuffer, { 
            name: `ticket-${ticket.ticket_number}-transcript.txt` 
        });

        const transcriptEmbed = new EmbedBuilder()
            .setTitle(`📝 Ticket Transcript - #${ticket.ticket_number}`)
            .setDescription(`**Channel:** ${ticketChannel.name}\n**Closed by:** ${interaction.user} (\`${interaction.user.tag}\`)`)
            .setColor(0x5865f2)
            .addFields([
                {
                    name: "🎲 **Game**",
                    value: `\`${getGameDisplayName(ticket.game)}\``,
                    inline: true
                },
                {
                    name: "🎮 **Gamemode**",
                    value: `\`${capitalizeFirstLetter(ticket.gamemode)}\``,
                    inline: true
                },
                {
                    name: "🎯 **Goal**",
                    value: ticket.goal.length > 50 ? `\`${ticket.goal.substring(0, 50)}...\`` : `\`${ticket.goal}\``,
                    inline: true
                },
                {
                    name: "📞 **Contact**",
                    value: `\`${ticket.contact}\``,
                    inline: true
                },
                {
                    name: "👤 **Submitted by**",
                    value: `<@${ticket.user_id}> (\`${ticket.user_tag}\`)`,
                    inline: false
                },
                {
                    name: "📊 **Statistics**",
                    value: [
                        `**Messages:** ${messages.length}`,
                        `**Created:** <t:${Math.floor(ticket.created_at / 1000)}:F>`,
                        `**Closed:** <t:${Math.floor(Date.now() / 1000)}:F>`
                    ].join('\n'),
                    inline: false
                }
            ])
            .setFooter({ 
                text: `Ticket #${ticket.ticket_number} • Generated by VouchBot`,
                iconURL: interaction.client.user?.displayAvatarURL()
            })
            .setTimestamp();

        if (ticket.claimed_by) {
            transcriptEmbed.addFields({
                name: "🤝 **Was claimed by**",
                value: `<@${ticket.claimed_by}> (\`${ticket.claimed_by_tag}\`)`,
                inline: false
            });
        }

        await transcriptChannel.send({
            embeds: [transcriptEmbed],
            files: [attachment]
        });

        console.log(` Transcript saved for ticket #${ticket.ticket_number}`);
        
        setTimeout(async () => {
            try {
                await ticketChannel.delete(`Ticket #${ticket.ticket_number} closed and transcript saved`);
                console.log(` Ticket channel deleted for ticket #${ticket.ticket_number}`);
            } catch (deleteError) {
                console.error(` Error deleting ticket channel for ticket #${ticket.ticket_number}:`, deleteError);
            }
        }, 10000); 
        
    } catch (error) {
        console.error(` Error generating transcript for ticket #${ticket.ticket_number}:`, error);
    }
}

async function formatTranscript(ticket: any, messages: Message[], closedBy: any): Promise<string> {
    const lines: string[] = [];
    
    lines.push('='.repeat(80));
    lines.push(`TICKET TRANSCRIPT - #${ticket.ticket_number}`);
    lines.push('='.repeat(80));
    lines.push('');
    
    lines.push('TICKET INFORMATION:');
    lines.push(`  Ticket ID: #${ticket.ticket_number}`);
    lines.push(`  Submitted by: ${ticket.user_tag} (${ticket.user_id})`);
    lines.push(`  Game: ${getGameDisplayName(ticket.game)}`);
    lines.push(`  Gamemode: ${capitalizeFirstLetter(ticket.gamemode)}`);
    lines.push(`  Goal: ${ticket.goal}`);
    lines.push(`  Contact: ${ticket.contact}`);
    lines.push(`  Created: ${new Date(ticket.created_at).toISOString()}`);
    lines.push(`  Closed: ${new Date().toISOString()}`);
    lines.push(`  Closed by: ${closedBy.tag} (${closedBy.id})`);
    if (ticket.claimed_by) {
        lines.push(`  Claimed by: ${ticket.claimed_by_tag} (${ticket.claimed_by})`);
    }
    lines.push('');
    
    lines.push('CHANNEL MESSAGES:');
    lines.push('-'.repeat(80));
    lines.push('');
    
    for (const message of messages) {
        const timestamp = message.createdAt.toISOString();
        const author = `${message.author.tag} (${message.author.id})`;
        const content = message.content || '[No text content]';
        
        lines.push(`[${timestamp}] ${author}:`);
        
        if (message.content) {
            const contentLines = content.split('\n');
            contentLines.forEach(line => {
                lines.push(`  ${line}`);
            });
        }
        
        if (message.attachments.size > 0) {
            lines.push('  [ATTACHMENTS]:');
            message.attachments.forEach(attachment => {
                lines.push(`    - ${attachment.name} (${attachment.url})`);
            });
        }
        
        if (message.embeds.length > 0) {
            lines.push('  [EMBEDS]:');
            message.embeds.forEach((embed, index) => {
                lines.push(`    Embed ${index + 1}:`);
                if (embed.title) lines.push(`      Title: ${embed.title}`);
                if (embed.description) lines.push(`      Description: ${embed.description}`);
                if (embed.fields.length > 0) {
                    lines.push('      Fields:');
                    embed.fields.forEach(field => {
                        lines.push(`        ${field.name}: ${field.value}`);
                    });
                }
            });
        }
        
        lines.push('');
    }
    
    lines.push('-'.repeat(80));
    lines.push(`Total messages: ${messages.length}`);
    lines.push(`Generated by VouchBot on ${new Date().toISOString()}`);
    lines.push('='.repeat(80));
    
    return lines.join('\n');
}

async function showHelperAuthorizationPrompt(interaction: ButtonInteraction, ticket: any): Promise<void> {
    const authContainer = new ContainerBuilder();
    if (!(authContainer as any).components) {
        (authContainer as any).components = [];
    }

    const mentionText = new TextDisplayBuilder()
        .setContent(`<@${ticket.claimed_by}> - Authorization needed for ticket closure`);
    (authContainer as any).components.push(mentionText);

    const authHeader = new TextDisplayBuilder()
        .setContent(`# 🔒 Request Ticket Closure Authorization`);
    (authContainer as any).components.push(authHeader);

    const authDescription = new TextDisplayBuilder()
        .setContent(`**${interaction.user}** wants to close this ticket.\n\nAs the helper assigned to this ticket, do you authorize closing it?`);
    (authContainer as any).components.push(authDescription);

    const authSummary = new TextDisplayBuilder()
        .setContent(`**📋 Ticket Summary**\n**Ticket:** #${ticket.ticket_number}\n**Helper:** <@${ticket.claimed_by}>\n**Creator:** <@${ticket.user_id}>`);
    (authContainer as any).components.push(authSummary);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents([
        new ButtonBuilder()
            .setCustomId(`authorize_close_${ticket.ticket_number}_${interaction.user.id}`)
            .setLabel('✅ Authorize Closure')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`deny_close_${ticket.ticket_number}_${interaction.user.id}`)
            .setLabel('❌ Deny Closure')
            .setStyle(ButtonStyle.Danger)
    ]);
    (authContainer as any).components.push(buttonRow);

    await interaction.reply({
        components: [authContainer],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: false
    });
}

export async function handleRingHelper(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.guild || !interaction.member) {
        await interaction.reply({
            content: "❌ This command can only be used in a server!",
            ephemeral: true
        });
        return;
    }

    const db = getDatabase();
    const ticket = await db.getTicketByChannelId(interaction.channelId);
    
    if (!ticket) {
        await interaction.reply({
            content: "❌ Could not find ticket information in database.",
            ephemeral: true
        });
        return;
    }

    if (ticket.status === 'closed') {
        await interaction.reply({
            content: "❌ This ticket is already closed!",
            ephemeral: true
        });
        return;
    }

    if (ticket.user_id !== interaction.user.id) {
        await interaction.reply({
            content: "❌ Only the ticket creator can ring the helper.",
            ephemeral: true
        });
        return;
    }

    const gameHelperRoleId = getGameHelperRoleId(ticket.game);
    let helperMention = '';
    
    if (gameHelperRoleId) {
        helperMention = `<@&${gameHelperRoleId}>`;
    } else {
        const helperRoleId = ticket.type === 'paid' ? process.env.PAID_HELPER_ROLE_ID : process.env.HELPER_ROLE_ID;
        if (helperRoleId) {
            helperMention = `<@&${helperRoleId}>`;
        }
    }

    if (!helperMention) {
        await interaction.reply({
            content: "❌ Helper role not configured.",
            ephemeral: true
        });
        return;
    }

    const ringContainer = new ContainerBuilder();
    if (!(ringContainer as any).components) {
        (ringContainer as any).components = [];
    }

    const pingContent = [
        `# 🔔 Helper Needed!`,
        ``,
        `${helperMention} ${interaction.user} is requesting assistance in this ${getGameDisplayName(ticket.game)} regular carry ticket!`,
        ``,
        `**Ticket:** \`#${ticket.ticket_number}\``,
        `**Gamemode:** \`${capitalizeFirstLetter(ticket.gamemode)}\``,
        `**Goal:** \`${ticket.goal}\``
    ].join('\n');

    const ringMessage = new TextDisplayBuilder()
        .setContent(pingContent);
    (ringContainer as any).components.push(ringMessage);

    await interaction.reply({
        components: [ringContainer],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { roles: [gameHelperRoleId || process.env.HELPER_ROLE_ID || process.env.PAID_HELPER_ROLE_ID].filter(Boolean) }
    });
}

export async function handleUnclaimTicket(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.guild || !interaction.member) {
        await interaction.reply({
            content: "❌ This command can only be used in a server!",
            ephemeral: true
        });
        return;
    }

    const db = getDatabase();
    const ticket = await db.getTicketByChannelId(interaction.channelId);
    
    if (!ticket) {
        await interaction.reply({
            content: "❌ Could not find ticket information in database.",
            ephemeral: true
        });
        return;
    }

    if (ticket.status === 'closed') {
        await interaction.reply({
            content: "❌ This ticket is already closed!",
            ephemeral: true
        });
        return;
    }

    if (ticket.status !== 'claimed') {
        await interaction.reply({
            content: "❌ This ticket is not currently claimed!",
            ephemeral: true
        });
        return;
    }

    const isClaimedByUser = ticket.claimed_by === interaction.user.id;
    const isAdmin = interaction.member && interaction.member.permissions && 
        typeof interaction.member.permissions !== 'string' && 
        interaction.member.permissions.has('Administrator');
    
    if (!isClaimedByUser && !isAdmin) {
        await interaction.reply({
            content: "❌ Only the helper who claimed this ticket or administrators can unclaim it.",
            ephemeral: true
        });
        return;
    }

    await db.unclaimTicket(ticket.ticket_number);

    const originalMessage = interaction.message;
    
    // Update the original message to remove claimed by information in Components V2 format
    const originalComponents = originalMessage?.components || [];
    const updatedComponents = [];
    
    // Find and update containers, filter out existing button containers
    for (const component of originalComponents) {
        if (component.type === 1) { // Action row - skip existing button rows
            continue;
        } else {
            // This should be the main container with ticket information
            const updatedContainer = JSON.parse(JSON.stringify(component));

            // Remove any existing action rows from the container to prevent duplicates
            if (updatedContainer.components) {
                const originalLength = updatedContainer.components.length;
                updatedContainer.components = updatedContainer.components.filter((comp: any) => comp.type !== 1);
                console.log(`[LEGACY_UNCLAIM_DEBUG] Filtered action rows: ${originalLength} -> ${updatedContainer.components.length}`);
            }

            // Remove any "Claimed by" sections
            if (updatedContainer.components) {
                const originalLength = updatedContainer.components.length;
                updatedContainer.components = updatedContainer.components.filter((comp: any) => {
                    return !(comp.type === 13 && comp.content && (comp.content.includes('Claimed by:') || comp.content.includes('🤝 Claimed by:')));
                });
                console.log(`[LEGACY_UNCLAIM_DEBUG] Filtered claimed by sections: ${originalLength} -> ${updatedContainer.components.length}`);
            }

            // Only add container if it has valid components
            if (updatedContainer.components && updatedContainer.components.length > 0) {
                updatedComponents.push(updatedContainer);
                console.log(`[LEGACY_UNCLAIM_DEBUG] Added container with ${updatedContainer.components.length} components`);
            } else {
                console.warn(`[LEGACY_UNCLAIM_DEBUG] Skipping empty container`);
            }
        }
    }

    const buttonContainer = new ContainerBuilder();
    if (!(buttonContainer as any).components) {
        (buttonContainer as any).components = [];
    }

    const buttons = [
        new ButtonBuilder()
            .setCustomId(`claim_ticket_${ticket.ticket_number}`)
            .setLabel('Claim')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🎫'),
        new ButtonBuilder()
            .setCustomId(`ring_helper_${ticket.ticket_number}`)
            .setLabel('Ring Helper')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📞'),
        new ButtonBuilder()
            .setCustomId(`close_ticket_${ticket.ticket_number}`)
            .setLabel('Close')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒')
    ];

    console.log(`[LEGACY_UNCLAIM_DEBUG] Creating button row with ${buttons.length} buttons for unclaimed ticket #${ticket.ticket_number}`);

    if (buttons.length === 0) {
        console.error(`[LEGACY_UNCLAIM_DEBUG] No buttons to create for ticket #${ticket.ticket_number}`);
        return;
    }

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
    (buttonContainer as any).components.push(buttonRow);

    console.log(`[LEGACY_UNCLAIM_DEBUG] Button container has ${(buttonContainer as any).components.length} components`);

    const channel = interaction.channel;
    if (channel && 'permissionOverwrites' in channel) {
        try {
            const helperRoleIds = process.env.HELPER_ROLE_IDS?.split(',') || [];
            const gameHelperRoleId = getGameHelperRoleId(ticket.game);
            
            const rolesToAllow = [...helperRoleIds];
            if (gameHelperRoleId && !rolesToAllow.includes(gameHelperRoleId)) {
                rolesToAllow.push(gameHelperRoleId);
            }

            for (const roleId of rolesToAllow) {
                if (roleId.trim()) {
                    await channel.permissionOverwrites.edit(roleId.trim(), {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true
                    });
                }
            }

            if (ticket.claimed_by) {
                await channel.permissionOverwrites.delete(ticket.claimed_by);
            }

            console.log(` Channel permissions updated - ticket #${ticket.ticket_number} now visible to all helpers`);
        } catch (permError) {
            console.warn(' Could not update channel permissions:', permError);
        }
    }

    const unclaimMessage = `**This ticket has been unclaimed by ${interaction.user}**\n\nIt is now available for any helper to claim.`;

    await interaction.deferUpdate();

    if ((buttonContainer as any).components && (buttonContainer as any).components.length > 0) {
        
        let validContainer = true;
        (buttonContainer as any).components.forEach((comp: any, index: number) => {
            if (!comp.components || comp.components.length === 0) {
                console.error(`[LEGACY_UNCLAIM_DEBUG] Button container component ${index} has invalid structure:`, comp);
                validContainer = false;
            }
        });

        if (validContainer) {
            updatedComponents.push(buttonContainer);
            console.log(`[LEGACY_UNCLAIM_DEBUG] Added valid button container`);
        } else {
            console.error(`[LEGACY_UNCLAIM_DEBUG] Skipping invalid button container`);
        }
    } else {
        console.error(`[LEGACY_UNCLAIM_DEBUG] Button container is empty or invalid`);
    }

    console.log(`[LEGACY_UNCLAIM_DEBUG] Attempting to update message with ${updatedComponents.length} components`);

    const validatedComponents = [];
    updatedComponents.forEach((component, index) => {
        console.log(`[LEGACY_UNCLAIM_DEBUG] Component ${index}:`, {
            type: component.type,
            hasComponents: !!component.components,
            componentsLength: component.components?.length || 0,
            componentTypes: component.components?.map((c: any) => ({ type: c.type, hasComponents: !!c.components, componentsLength: c.components?.length })) || []
        });

        if (component.components && component.components.length > 0) {
            
            const validSubComponents = component.components.every((subComp: any) => {
                if (subComp.type === 1) { 
                    return subComp.components && subComp.components.length > 0 && subComp.components.length <= 5;
                }
                return true; 
            });

            if (validSubComponents) {
                validatedComponents.push(component);
                console.log(`[LEGACY_UNCLAIM_DEBUG] Component ${index} is valid`);
            } else {
                console.error(`[LEGACY_UNCLAIM_DEBUG] Component ${index} has invalid sub-components, skipping`);
            }
        } else {
            console.error(`[LEGACY_UNCLAIM_DEBUG] Component ${index} has no components, skipping`);
        }
    });

    console.log(`[LEGACY_UNCLAIM_DEBUG] Final component count: ${validatedComponents.length} (originally ${updatedComponents.length})`);

    try {
        await interaction.editReply({
            components: validatedComponents,
            flags: MessageFlags.IsComponentsV2
        });

        console.log(`[LEGACY_UNCLAIM_DEBUG] Successfully updated message for ticket #${ticket.ticket_number}`);

        await interaction.followUp({
            content: unclaimMessage,
            ephemeral: false
        });

    } catch (updateError) {
        console.error(`[LEGACY_UNCLAIM_DEBUG] Error updating message for ticket #${ticket.ticket_number}:`, updateError);

        try {
            await interaction.followUp({
                content: `❌ **Error updating message, but ticket #${ticket.ticket_number} has been unclaimed successfully.**\n\n${unclaimMessage}`,
                ephemeral: false
            });
        } catch (followUpError) {
            console.error(`[LEGACY_UNCLAIM_DEBUG] Error sending follow-up:`, followUpError);
        }
    }
}

export async function finalizeTicketClosure(interaction: ButtonInteraction, ticket: any): Promise<void> {
    const db = getDatabase();
    
    await db.closeTicket(ticket.ticket_number);
    
    await botLogger.logTicketClosed(ticket.ticket_number, 'Ticket completed', ticket.user_id);

    const closedContainer = new ContainerBuilder();
    if (!(closedContainer as any).components) {
        (closedContainer as any).components = [];
    }

    const titleText = new TextDisplayBuilder()
        .setContent(`# 🎫 Ticket #${ticket.ticket_number} - CLOSED\n\n**Ticket ID:** \`#${ticket.ticket_number}\`\n**Status:** Closed`);

    const detailsText = new TextDisplayBuilder()
        .setContent(`**Gamemode:** \`${capitalizeFirstLetter(ticket.gamemode)}\`\n**Goal:** \`${ticket.goal}\`\n**Contact:** \`${ticket.contact}\`\n**Submitted by:** <@${ticket.user_id}> (\`${ticket.user_tag}\`)`);

    if (ticket.claimed_by) {
        const claimedText = new TextDisplayBuilder()
            .setContent(`**Was claimed by:** <@${ticket.claimed_by}> (\`${ticket.claimed_by_tag}\`)`);
        (closedContainer as any).components.push(claimedText);
    }

    const closedByText = new TextDisplayBuilder()
        .setContent(`**Closed by:** <@${interaction.user.id}> (\`${interaction.user.tag}\`)\n**Time:** ${new Date().toLocaleString()}`);
    (closedContainer as any).components.push(titleText, detailsText, closedByText);

    const closeMessage = `🔒 **This ticket has been closed by ${interaction.user}**\n\n📝 **Transcript has been saved to the transcript channel.**\n⏰ **This channel will be deleted in 10 seconds.**\n\n*If you need further assistance, please create a new ticket.*`;

    try {
        await interaction.update({
            components: [closedContainer],
            flags: MessageFlags.IsComponentsV2
        });

        await interaction.followUp({
            content: closeMessage,
            ephemeral: false
        });
    } catch (interactionError) {
        console.warn('Interaction may have timed out, sending message directly to channel');
        if (interaction.channel) {
            await interaction.channel.send({
                components: [closedContainer],
                flags: MessageFlags.IsComponentsV2
            });
            await interaction.channel.send(closeMessage);
        }
    }
}

export async function closeTicketAfterReview(ticket: any, channelId: string, guildId: string, closedByUserId: string, closedByUserTag: string): Promise<void> {
    const db = getDatabase();
    
    try {
        await db.closeTicket(ticket.ticket_number);

        const client = require('../../index').client as any;
        if (!client) {
            console.error(' Client not found when trying to close ticket after review');
            return;
        }

        const guild = await client.guilds.fetch(guildId);
        const ticketChannel = guild.channels.cache.get(channelId) as TextChannel;
        
        if (!ticketChannel) {
            console.error(` Ticket channel ${channelId} not found for ticket #${ticket.ticket_number}`);
            return;
        }

        await generateTicketTranscriptForChannel(ticketChannel, ticket, closedByUserId, closedByUserTag);

        const closedEmbed = new EmbedBuilder()
            .setTitle(`🔒 Ticket #${ticket.ticket_number} - CLOSED`)
            .setDescription(`**Ticket ID:** \`#${ticket.ticket_number}\`\n**Status:** 🔴 Closed after review submission`)
            .setColor(0xff0000)
            .addFields([
                {
                    name: "🎮 **Gamemode**",
                    value: `\`${capitalizeFirstLetter(ticket.gamemode)}\``,
                    inline: true
                },
                {
                    name: "🎯 **Goal**",
                    value: `\`${ticket.goal}\``,
                    inline: true
                },
                {
                    name: "📞 **Contact**",
                    value: `\`${ticket.contact}\``,
                    inline: true
                },
                {
                    name: "👤 **Submitted by**",
                    value: `<@${ticket.user_id}> (\`${ticket.user_tag}\`)`,
                    inline: false
                }
            ])
            .setFooter({ 
                text: `Ticket #${ticket.ticket_number} • Closed automatically after review`,
                iconURL: client.user?.displayAvatarURL()
            })
            .setTimestamp();

        if (ticket.claimed_by) {
            closedEmbed.addFields({
                name: "🤝 **Was claimed by**",
                value: `<@${ticket.claimed_by}> (\`${ticket.claimed_by_tag}\`)`,
                inline: false
            });
        }

        const closeMessage = `🔒 **This ticket has been closed automatically after review submission**\n\n📝 **Transcript has been saved to the transcript channel.**\n⏰ **This channel will be deleted in 10 seconds.**\n\n*Thank you for your feedback! If you need further assistance, please create a new ticket.*`;

        await ticketChannel.send({
            embeds: [closedEmbed]
        });

        await ticketChannel.send(closeMessage);

        setTimeout(async () => {
            try {
                await ticketChannel.delete(`Ticket #${ticket.ticket_number} closed after review and transcript saved`);
                console.log(` Ticket channel deleted for ticket #${ticket.ticket_number} after review`);
            } catch (deleteError) {
                console.error(` Error deleting ticket channel for ticket #${ticket.ticket_number}:`, deleteError);
            }
        }, 10000); 

        console.log(` Ticket #${ticket.ticket_number} successfully closed after review submission`);

    } catch (error) {
        console.error(` Error closing ticket after review for ticket #${ticket.ticket_number}:`, error);
    }
}

async function generateTicketTranscriptForChannel(ticketChannel: TextChannel, ticket: any, closedByUserId: string, closedByUserTag: string): Promise<void> {
    const transcriptChannelId = getGameTranscriptChannelId(ticket.game, ticket.type);
    
    if (!transcriptChannelId) {
        const channelType = `${ticket.game?.toUpperCase()}_${ticket.type?.toUpperCase()}_TRANSCRIPT_CHANNEL_ID`;
        console.warn(`⚠️ ${channelType} not configured in environment variables`);
        return;
    }

    const guild = ticketChannel.guild;
    if (!guild) return;

    const transcriptChannel = guild.channels.cache.get(transcriptChannelId) as TextChannel;
    if (!transcriptChannel) {
        console.error(' Transcript channel not found or bot lacks access');
        return;
    }

    try {
        const batch = await ticketChannel.messages.fetch({ limit: 100 });
        const messages = Array.from(batch.values());

        messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        const transcriptContent = await formatTranscript(ticket, messages, { id: closedByUserId, tag: closedByUserTag });

        const transcriptBuffer = Buffer.from(transcriptContent, 'utf-8');
        const attachment = new AttachmentBuilder(transcriptBuffer, { 
            name: `ticket-${ticket.ticket_number}-transcript.txt` 
        });

        const transcriptEmbed = new EmbedBuilder()
            .setTitle(`📝 Ticket Transcript - #${ticket.ticket_number}`)
            .setDescription(`**Channel:** ${ticketChannel.name}\n**Closed by:** <@${closedByUserId}> (\`${closedByUserTag}\`)`)
            .setColor(0x5865f2)
            .addFields([
                {
                    name: "🎲 **Game**",
                    value: `\`${getGameDisplayName(ticket.game)}\``,
                    inline: true
                },
                {
                    name: "🎮 **Gamemode**",
                    value: `\`${capitalizeFirstLetter(ticket.gamemode)}\``,
                    inline: true
                },
                {
                    name: "🎯 **Goal**",
                    value: ticket.goal.length > 50 ? `\`${ticket.goal.substring(0, 50)}...\`` : `\`${ticket.goal}\``,
                    inline: true
                },
                {
                    name: "📞 **Contact**",
                    value: `\`${ticket.contact}\``,
                    inline: true
                },
                {
                    name: "👤 **Submitted by**",
                    value: `<@${ticket.user_id}> (\`${ticket.user_tag}\`)`,
                    inline: false
                },
                {
                    name: "📊 **Statistics**",
                    value: [
                        `**Messages:** ${messages.length}`,
                        `**Created:** <t:${Math.floor(ticket.created_at / 1000)}:F>`,
                        `**Closed:** <t:${Math.floor(Date.now() / 1000)}:F>`
                    ].join('\n'),
                    inline: false
                }
            ])
            .setFooter({ 
                text: `Ticket #${ticket.ticket_number} • Generated by VouchBot`,
                iconURL: guild.client.user?.displayAvatarURL()
            })
            .setTimestamp();

        if (ticket.claimed_by) {
            transcriptEmbed.addFields({
                name: "🤝 **Was claimed by**",
                value: `<@${ticket.claimed_by}> (\`${ticket.claimed_by_tag}\`)`,
                inline: false
            });
        }

        await transcriptChannel.send({
            embeds: [transcriptEmbed],
            files: [attachment]
        });

        console.log(` Transcript saved for ticket #${ticket.ticket_number}`);

    } catch (error) {
        console.error(` Error generating transcript for ticket #${ticket.ticket_number}:`, error);
    }
}

export async function handleAuthorizeClose(interaction: ButtonInteraction): Promise<void> {
    try {
        console.log(`[AUTHORIZE_CLOSE] Button clicked by ${interaction.user.tag} in channel ${interaction.channelId}`);

        const customId = interaction.customId;
        
        const match = customId.match(/^authorize_close_(.+)_(\d+)$/);

        if (!match) {
            console.error(`[AUTHORIZE_CLOSE] Invalid custom ID format: ${customId}`);
            await interaction.reply({
                content: "❌ Invalid authorization button data.",
                ephemeral: true
            });
            return;
        }

        const ticketNumber = match[1];
        const requestingUserId = match[2];
        console.log(`[AUTHORIZE_CLOSE] Parsed ticket #${ticketNumber}, requesting user: ${requestingUserId}`);

        await interaction.deferUpdate();

        const db = getDatabase();
        const ticket = await db.getTicketByChannelId(interaction.channelId);

        if (!ticket) {
            console.error(`[AUTHORIZE_CLOSE] No ticket found for channel ${interaction.channelId}`);
            await interaction.followUp({
                content: "❌ Could not find ticket information in database.",
                ephemeral: true
            });
            return;
        }

        if (ticket.claimed_by !== interaction.user.id) {
            console.error(`[AUTHORIZE_CLOSE] User ${interaction.user.id} is not the assigned helper (${ticket.claimed_by})`);
            await interaction.followUp({
                content: "❌ Only the assigned helper can authorize ticket closure.",
                ephemeral: true
            });
            return;
        }

        console.log(`[AUTHORIZE_CLOSE] Authorization granted by ${interaction.user.tag}`);

        const authorizedContainer = new ContainerBuilder();
        if (!(authorizedContainer as any).components) {
            (authorizedContainer as any).components = [];
        }

        const authorizedHeader = new TextDisplayBuilder()
            .setContent(`# ✅ Authorization Granted`);
        (authorizedContainer as any).components.push(authorizedHeader);

        const authorizedDescription = new TextDisplayBuilder()
            .setContent(`Authorization granted. Proceeding to close the ticket...\n\n**${interaction.user}** has authorized the ticket closure.`);
        (authorizedContainer as any).components.push(authorizedDescription);

        await interaction.editReply({
            components: [authorizedContainer],
            flags: MessageFlags.IsComponentsV2
        });

        setTimeout(async () => {
            try {
                console.log(`[AUTHORIZE_CLOSE] Starting ticket closure process for ticket #${ticket.ticket_number}`);
                const client = require('../../index').client as any;
                const channel = await client.channels.fetch(interaction.channelId);

                if (channel) {
                    await generateTicketTranscriptForChannel(channel, ticket, interaction.user.id, interaction.user.tag);

                    const db = getDatabase();
                    await db.closeTicket(ticket.ticket_number);
                    await botLogger.logTicketClosed(ticket.ticket_number, 'Ticket completed', ticket.user_id);

                    await channel.send(`🔒 **This ticket has been closed and transcript saved.**\n⏰ **This channel will be deleted in 10 seconds.**`);

                    setTimeout(async () => {
                        try {
                            await channel.delete(`Ticket #${ticket.ticket_number} closed and transcript saved`);
                            console.log(`[AUTHORIZE_CLOSE] Channel deleted for ticket #${ticket.ticket_number}`);
                        } catch (deleteError) {
                            console.error(`[AUTHORIZE_CLOSE] Error deleting ticket channel:`, deleteError);
                        }
                    }, 10000);
                }
            } catch (error) {
                console.error('[AUTHORIZE_CLOSE] Error in authorization close process:', error);
            }
        }, 2000); 
    } catch (error) {
        console.error('[AUTHORIZE_CLOSE] Fatal error in handleAuthorizeClose:', error);
        try {
            if (interaction.deferred) {
                await interaction.followUp({
                    content: "❌ An error occurred while processing the authorization. Please try again.",
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: "❌ An error occurred while processing the authorization. Please try again.",
                    ephemeral: true
                });
            }
        } catch (followUpError) {
            console.error('[AUTHORIZE_CLOSE] Could not send error message:', followUpError);
        }
    }
}

export async function handleDenyClose(interaction: ButtonInteraction): Promise<void> {
    try {
        console.log(`[DENY_CLOSE] Button clicked by ${interaction.user.tag} in channel ${interaction.channelId}`);

        const customId = interaction.customId;
        
        const match = customId.match(/^deny_close_(.+)_(\d+)$/);

        if (!match) {
            console.error(`[DENY_CLOSE] Invalid custom ID format: ${customId}`);
            await interaction.reply({
                content: "❌ Invalid deny button data.",
                ephemeral: true
            });
            return;
        }

        const ticketNumber = match[1];
        const requestingUserId = match[2];
        console.log(`[DENY_CLOSE] Parsed ticket #${ticketNumber}, requesting user: ${requestingUserId}`);

        await interaction.deferUpdate();

        const db = getDatabase();
        const ticket = await db.getTicketByChannelId(interaction.channelId);

        if (!ticket) {
            console.error(`[DENY_CLOSE] No ticket found for channel ${interaction.channelId}`);
            await interaction.followUp({
                content: "❌ Could not find ticket information in database.",
                ephemeral: true
            });
            return;
        }

        if (ticket.claimed_by !== interaction.user.id) {
            console.error(`[DENY_CLOSE] User ${interaction.user.id} is not the assigned helper (${ticket.claimed_by})`);
            await interaction.followUp({
                content: "❌ Only the assigned helper can deny ticket closure.",
                ephemeral: true
            });
            return;
        }

        console.log(`[DENY_CLOSE] Closure request denied by ${interaction.user.tag}`);

        const deniedContainer = new ContainerBuilder();
        if (!(deniedContainer as any).components) {
            (deniedContainer as any).components = [];
        }

        const deniedHeader = new TextDisplayBuilder()
            .setContent(`# ❌ Request Denied`);
        (deniedContainer as any).components.push(deniedHeader);

        const deniedDescription = new TextDisplayBuilder()
            .setContent(`<@${requestingUserId}> - Your request to close the ticket has been denied.\n\n**${interaction.user}** has denied the ticket closure request.`);
        (deniedContainer as any).components.push(deniedDescription);

        await interaction.editReply({
            components: [deniedContainer],
            flags: MessageFlags.IsComponentsV2
        });
    } catch (error) {
        console.error('[DENY_CLOSE] Fatal error in handleDenyClose:', error);
        try {
            if (interaction.deferred) {
                await interaction.followUp({
                    content: "❌ An error occurred while processing the denial. Please try again.",
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: "❌ An error occurred while processing the denial. Please try again.",
                    ephemeral: true
                });
            }
        } catch (followUpError) {
            console.error('[DENY_CLOSE] Could not send error message:', followUpError);
        }
    }
}
