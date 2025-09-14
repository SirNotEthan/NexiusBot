import { ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, TextChannel, AttachmentBuilder, ChannelType } from 'discord.js';
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

function getGameTranscriptChannelId(game: string, type: 'regular' | 'paid'): string | undefined {
    if (!game || !type) {
        console.warn('⚠️ Missing game or type information for transcript channel lookup');
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

    await db.claimTicket(ticket.ticket_number, interaction.user.id, interaction.user.tag);
    
    await botLogger.logTicketClaimed(ticket.ticket_number, interaction.user.id, ticket.user_id);

    const originalMessage = interaction.message;
    const originalEmbed = originalMessage?.embeds[0];

    const updatedEmbed = new EmbedBuilder()
        .setTitle(originalEmbed?.title || `🎫 Support Ticket #${ticket.ticket_number}`)
        .setDescription(`**Ticket ID:** \`#${ticket.ticket_number}\`\n**Status:** 🟢 Claimed`)
        .setColor(0x00ff00)
        .addFields([
            {
                name: "🎮 **Gamemode**",
                value: `\`${ticket.gamemode}\``,
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
            },
            {
                name: "🤝 **Claimed by**",
                value: `${interaction.user} (\`${interaction.user.tag}\`)`,
                inline: false
            }
        ])
        .setFooter({ 
            text: `Ticket #${ticket.ticket_number} • Claimed`,
            iconURL: interaction.client.user?.displayAvatarURL()
        })
        .setTimestamp();

    const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents([
        new ButtonBuilder()
            .setCustomId('edit_ticket')
            .setLabel('Edit Ticket')
            .setEmoji('✏️')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Close Ticket')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
    ]);

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

            console.log(`✅ Channel permissions updated - ticket #${ticket.ticket_number} now hidden from other helpers`);
        } catch (permError) {
            console.warn('⚠️ Could not update channel permissions:', permError);
        }
    }

    const claimMessage = `✅ **This ticket has been claimed by ${interaction.user}**\n\nThey will be assisting you with your request.`;

    await interaction.deferUpdate();
    
    await interaction.editReply({
        embeds: [updatedEmbed],
        components: [updatedRow]
    });

    await interaction.followUp({
        content: claimMessage,
        ephemeral: false
    });
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
        .setValue(ticket.gamemode)
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
    } else if (!isOwner && !isHelper) {
        await interaction.reply({
            content: `❌ You don't have permission to close this ticket. Only the ticket owner or ${getGameDisplayName(ticket.game)} helper roles can close this ticket.`,
            ephemeral: true
        });
        return;
    }

    if (ticket.claimed_by) {
        await showReviewPrompt(interaction, ticket);
        return; // Don't close the ticket yet, wait for review
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
        console.error('❌ Transcript channel not found or bot lacks access');
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
                    value: `\`${ticket.gamemode}\``,
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

        try {
            const ticketOpener = await interaction.client.users.fetch(ticket.user_id);
            const dmEmbed = new EmbedBuilder()
                .setTitle(`📝 Your Ticket Transcript - #${ticket.ticket_number}`)
                .setDescription(`Here's the complete transcript of your support ticket.\n\n**Ticket Details:**`)
                .setColor(0x5865f2)
                .addFields([
                    {
                        name: "🎲 **Game**",
                        value: `\`${getGameDisplayName(ticket.game)}\``,
                        inline: true
                    },
                    {
                        name: "🎮 **Gamemode**",
                        value: `\`${ticket.gamemode}\``,
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
                    text: `Thank you for using our support system!`,
                    iconURL: interaction.client.user?.displayAvatarURL()
                })
                .setTimestamp();

            if (ticket.claimed_by) {
                dmEmbed.addFields({
                    name: "🤝 **Helped by**",
                    value: `${ticket.claimed_by_tag}`,
                    inline: false
                });
            }

            await ticketOpener.send({
                embeds: [dmEmbed],
                files: [new AttachmentBuilder(transcriptBuffer, { name: `ticket-${ticket.ticket_number}-transcript.txt` })]
            });

            console.log(`✅ Transcript sent to user ${ticket.user_tag} via DM`);
        } catch (dmError) {
            console.warn(`⚠️ Could not send transcript to user ${ticket.user_tag} via DM:`, dmError);
        }

        console.log(`✅ Transcript saved for ticket #${ticket.ticket_number}`);
        
        setTimeout(async () => {
            try {
                await ticketChannel.delete(`Ticket #${ticket.ticket_number} closed and transcript saved`);
                console.log(`✅ Ticket channel deleted for ticket #${ticket.ticket_number}`);
            } catch (deleteError) {
                console.error(`❌ Error deleting ticket channel for ticket #${ticket.ticket_number}:`, deleteError);
            }
        }, 10000); // 10 second delay
        
    } catch (error) {
        console.error(`❌ Error generating transcript for ticket #${ticket.ticket_number}:`, error);
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
    lines.push(`  Gamemode: ${ticket.gamemode}`);
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

async function showReviewPrompt(interaction: ButtonInteraction, ticket: any): Promise<void> {
    const reviewEmbed = new EmbedBuilder()
        .setTitle("📝 Rate Your Support Experience")
        .setDescription(`**Before we close this ticket**, please take a moment to rate your experience with **${ticket.claimed_by_tag}**.\n\nYour feedback helps us recognize great helpers and improve our service quality.`)
        .setColor(0xf39c12)
        .addFields([
            {
                name: "📋 **Ticket Summary**",
                value: `**Ticket:** #${ticket.ticket_number}\n**Helper:** ${ticket.claimed_by_tag}\n**Type:** ${ticket.type === 'paid' ? '💳 Paid Help' : '🆓 Free Help'}`,
                inline: false
            }
        ])
        .setFooter({ 
            text: "Select your rating below • After submitting your review, the ticket will be automatically closed",
            iconURL: interaction.client.user?.displayAvatarURL()
        })
        .setTimestamp();

    const reviewRow = new ActionRowBuilder<ButtonBuilder>().addComponents([
        new ButtonBuilder()
            .setCustomId(`close_review_1_${ticket.ticket_number}_${ticket.claimed_by}_${ticket.type}`)
            .setLabel('1 ⭐')
            .setEmoji('😞')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`close_review_2_${ticket.ticket_number}_${ticket.claimed_by}_${ticket.type}`)
            .setLabel('2 ⭐')
            .setEmoji('😐')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`close_review_3_${ticket.ticket_number}_${ticket.claimed_by}_${ticket.type}`)
            .setLabel('3 ⭐')
            .setEmoji('🙂')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`close_review_4_${ticket.ticket_number}_${ticket.claimed_by}_${ticket.type}`)
            .setLabel('4 ⭐')
            .setEmoji('😊')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`close_review_5_${ticket.ticket_number}_${ticket.claimed_by}_${ticket.type}`)
            .setLabel('5 ⭐')
            .setEmoji('😍')
            .setStyle(ButtonStyle.Success)
    ]);

    const skipRow = new ActionRowBuilder<ButtonBuilder>().addComponents([
        new ButtonBuilder()
            .setCustomId(`close_skip_review_${ticket.ticket_number}`)
            .setLabel('Skip Review & Close Ticket')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary)
    ]);

    await interaction.reply({
        content: "## 🌟 How was your support experience?",
        embeds: [reviewEmbed],
        components: [reviewRow, skipRow],
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

    const ringMessage = `🔔 **Helper Ring!**\n\n${helperMention} - ${interaction.user} is requesting assistance in this ${getGameDisplayName(ticket.game)} ${ticket.type} carry ticket!\n\n**Ticket:** #${ticket.ticket_number}\n**Gamemode:** ${ticket.gamemode}\n**Goal:** ${ticket.goal}`;

    await interaction.reply({
        content: ringMessage,
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
    const originalEmbed = originalMessage?.embeds[0];

    const updatedEmbed = new EmbedBuilder()
        .setTitle(originalEmbed?.title || `🎫 Support Ticket #${ticket.ticket_number}`)
        .setDescription(`**Ticket ID:** \`#${ticket.ticket_number}\`\n**Status:** 🟡 Open`)
        .setColor(0xffa500)
        .addFields([
            {
                name: "🎮 **Gamemode**",
                value: `\`${ticket.gamemode}\``,
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
            text: `Ticket #${ticket.ticket_number} • Available for claiming`,
            iconURL: interaction.client.user?.displayAvatarURL()
        })
        .setTimestamp();

    const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents([
        new ButtonBuilder()
            .setCustomId(`claim_ticket_${ticket.ticket_number}`)
            .setLabel('Claim Request')
            .setEmoji('🤝')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`ring_helper_${ticket.ticket_number}`)
            .setLabel('Ring Helper')
            .setEmoji('🔔')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`close_ticket_${ticket.ticket_number}`)
            .setLabel('Close Request')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
    ]);

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

            console.log(`✅ Channel permissions updated - ticket #${ticket.ticket_number} now visible to all helpers`);
        } catch (permError) {
            console.warn('⚠️ Could not update channel permissions:', permError);
        }
    }

    const unclaimMessage = `🔓 **This ticket has been unclaimed by ${interaction.user}**\n\nIt is now available for any helper to claim.`;

    await interaction.deferUpdate();
    
    await interaction.editReply({
        embeds: [updatedEmbed],
        components: [updatedRow]
    });

    await interaction.followUp({
        content: unclaimMessage,
        ephemeral: false
    });
}

export async function finalizeTicketClosure(interaction: ButtonInteraction, ticket: any): Promise<void> {
    const db = getDatabase();
    
    await db.closeTicket(ticket.ticket_number);
    
    await botLogger.logTicketClosed(ticket.ticket_number, 'Ticket completed', ticket.user_id);

    const closedEmbed = new EmbedBuilder()
        .setTitle(`🔒 Ticket #${ticket.ticket_number} - CLOSED`)
        .setDescription(`**Ticket ID:** \`#${ticket.ticket_number}\`\n**Status:** 🔴 Closed`)
        .setColor(0xff0000)
        .addFields([
            {
                name: "🎮 **Gamemode**",
                value: `\`${ticket.gamemode}\``,
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
            text: `Ticket #${ticket.ticket_number} • Closed by ${interaction.user.tag}`,
            iconURL: interaction.client.user?.displayAvatarURL()
        })
        .setTimestamp();

    if (ticket.claimed_by) {
        closedEmbed.addFields({
            name: "🤝 **Was claimed by**",
            value: `<@${ticket.claimed_by}> (\`${ticket.claimed_by_tag}\`)`,
            inline: false
        });
    }

    closedEmbed.addFields({
        name: "🔒 **Closed by**",
        value: `${interaction.user} (\`${interaction.user.tag}\`)`,
        inline: false
    });

    const closeMessage = `🔒 **This ticket has been closed by ${interaction.user}**\n\n📝 **Transcript has been sent to you via DM and saved to the transcript channel.**\n⏰ **This channel will be deleted in 10 seconds.**\n\n*If you need further assistance, please create a new ticket.*`;

    try {
        await interaction.update({
            embeds: [closedEmbed],
            components: []
        });

        await interaction.followUp({
            content: closeMessage,
            ephemeral: false
        });
    } catch (interactionError) {
        console.warn('Interaction may have timed out, sending message directly to channel');
        if (interaction.channel) {
            await interaction.channel.send({
                embeds: [closedEmbed]
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
            console.error('❌ Client not found when trying to close ticket after review');
            return;
        }

        const guild = await client.guilds.fetch(guildId);
        const ticketChannel = guild.channels.cache.get(channelId) as TextChannel;
        
        if (!ticketChannel) {
            console.error(`❌ Ticket channel ${channelId} not found for ticket #${ticket.ticket_number}`);
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
                    value: `\`${ticket.gamemode}\``,
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

        const closeMessage = `🔒 **This ticket has been closed automatically after review submission**\n\n📝 **Transcript has been sent to you via DM and saved to the transcript channel.**\n⏰ **This channel will be deleted in 10 seconds.**\n\n*Thank you for your feedback! If you need further assistance, please create a new ticket.*`;

        await ticketChannel.send({
            embeds: [closedEmbed]
        });

        await ticketChannel.send(closeMessage);

        setTimeout(async () => {
            try {
                await ticketChannel.delete(`Ticket #${ticket.ticket_number} closed after review and transcript saved`);
                console.log(`✅ Ticket channel deleted for ticket #${ticket.ticket_number} after review`);
            } catch (deleteError) {
                console.error(`❌ Error deleting ticket channel for ticket #${ticket.ticket_number}:`, deleteError);
            }
        }, 10000); // 10 second delay

        console.log(`✅ Ticket #${ticket.ticket_number} successfully closed after review submission`);

    } catch (error) {
        console.error(`❌ Error closing ticket after review for ticket #${ticket.ticket_number}:`, error);
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
        console.error('❌ Transcript channel not found or bot lacks access');
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
                    value: `\`${ticket.gamemode}\``,
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

        try {
            const ticketOpener = await guild.client.users.fetch(ticket.user_id);
            const dmEmbed = new EmbedBuilder()
                .setTitle(`📝 Your Ticket Transcript - #${ticket.ticket_number}`)
                .setDescription(`Here's the complete transcript of your support ticket.\n\n**Ticket Details:**`)
                .setColor(0x5865f2)
                .addFields([
                    {
                        name: "🎲 **Game**",
                        value: `\`${getGameDisplayName(ticket.game)}\``,
                        inline: true
                    },
                    {
                        name: "🎮 **Gamemode**",
                        value: `\`${ticket.gamemode}\``,
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
                    text: `Thank you for using our support system!`,
                    iconURL: guild.client.user?.displayAvatarURL()
                })
                .setTimestamp();

            if (ticket.claimed_by) {
                dmEmbed.addFields({
                    name: "🤝 **Helped by**",
                    value: `${ticket.claimed_by_tag}`,
                    inline: false
                });
            }

            await ticketOpener.send({
                embeds: [dmEmbed],
                files: [new AttachmentBuilder(transcriptBuffer, { name: `ticket-${ticket.ticket_number}-transcript.txt` })]
            });

            console.log(`✅ Transcript sent to user ${ticket.user_tag} via DM`);
        } catch (dmError) {
            console.warn(`⚠️ Could not send transcript to user ${ticket.user_tag} via DM:`, dmError);
        }

        console.log(`✅ Transcript saved for ticket #${ticket.ticket_number}`);
        
    } catch (error) {
        console.error(`❌ Error generating transcript for ticket #${ticket.ticket_number}:`, error);
    }
}

