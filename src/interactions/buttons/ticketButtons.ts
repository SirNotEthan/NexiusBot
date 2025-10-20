import { ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, TextChannel, AttachmentBuilder } from 'discord.js';
import type { Message } from 'discord.js';
import { getDatabase } from '../../database';
import { cooldownManager } from '../../utils/cooldownManager';

export async function handleTicketButtons(interaction: ButtonInteraction): Promise<void> {
    const originalMessage = interaction.message;
    if (!originalMessage) {
        await interaction.reply({
            content: "❌ Could not find the original ticket form.",
            ephemeral: true
        });
        return;
    }

    const currentEmbed = originalMessage.embeds[0];
    if (!currentEmbed) {
        await interaction.reply({
            content: "❌ Could not find ticket form data.",
            ephemeral: true
        });
        return;
    }

    const ticketData: any = {};
    currentEmbed.fields?.forEach(field => {
        const fieldName = field.name?.replace(/\*\*/g, '').trim();
        switch (fieldName) {
            case "📂 Category":
                if (field.value !== "❌ *Not set*") {
                    ticketData.category = field.value.replace(/`/g, '').replace(/^[^ ]+ /, '').trim();
                }
                break;
            case "📋 Subject":
                if (field.value !== "❌ *Not set*") {
                    const value = field.value.replace(/`/g, '').trim();
                    ticketData.subject = value.endsWith('...') ? value : value;
                }
                break;
            case "⚡ Priority":
                if (field.value !== "❌ *Not set*") {
                    ticketData.priority = field.value.replace(/`/g, '').replace(/^[^ ]+ /, '').trim().toLowerCase();
                }
                break;
            case "📝 Description":
                if (field.value !== "❌ *Not set*") {
                    const value = field.value.replace(/`/g, '').trim();
                    ticketData.description = value.endsWith('...') ? value : value;
                }
                break;
            case "📞 Contact Info":
                if (field.value !== "❌ *Not set*") {
                    ticketData.contact = field.value.replace(/`/g, '').trim();
                }
                break;
        }
    });

    const { customId } = interaction;

    switch (customId) {
        case 'ticket_category':
            await showCategoryModal(interaction);
            break;
        case 'ticket_subject':
            await showSubjectModal(interaction);
            break;
        case 'ticket_priority':
            await showPriorityModal(interaction);
            break;
        case 'ticket_description':
            await showDescriptionModal(interaction);
            break;
        case 'ticket_contact':
            await showContactModal(interaction);
            break;
        case 'ticket_submit':
            if (cooldownManager.isOnCooldown(interaction.user.id, 'ticket')) {
                const remainingTime = cooldownManager.getRemainingCooldown(interaction.user.id, 'ticket');
                const timeString = cooldownManager.formatRemainingTime(remainingTime);
                
                await interaction.reply({
                    content: `⏰ **Cooldown Active**\n\nYou must wait **${timeString}** before creating another support ticket.\n\n*This prevents spam and helps us manage tickets efficiently.*`,
                    ephemeral: true
                });
                return;
            }
            await submitTicket(interaction, ticketData);
            break;
        case 'ticket_cancel':
            await cancelTicket(interaction);
            break;
    }
}

async function showCategoryModal(interaction: ButtonInteraction): Promise<void> {
    const modal = new ModalBuilder()
        .setCustomId('ticket_category_modal')
        .setTitle('Select Category');

    const categoryInput = new TextInputBuilder()
        .setCustomId('category_input')
        .setLabel('Category')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('technical, general, feature, billing, moderation, other')
        .setRequired(true)
        .setMaxLength(50);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(categoryInput));
    await interaction.showModal(modal);
}

async function showSubjectModal(interaction: ButtonInteraction): Promise<void> {
    const modal = new ModalBuilder()
        .setCustomId('ticket_subject_modal')
        .setTitle('Ticket Subject');

    const subjectInput = new TextInputBuilder()
        .setCustomId('subject_input')
        .setLabel('Subject')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Brief description of your issue or request')
        .setRequired(true)
        .setMaxLength(100);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput));
    await interaction.showModal(modal);
}

async function showPriorityModal(interaction: ButtonInteraction): Promise<void> {
    const modal = new ModalBuilder()
        .setCustomId('ticket_priority_modal')
        .setTitle('Set Priority Level');

    const priorityInput = new TextInputBuilder()
        .setCustomId('priority_input')
        .setLabel('Priority (low, medium, high, critical)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('low, medium, high, or critical')
        .setRequired(true)
        .setMaxLength(20);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(priorityInput));
    await interaction.showModal(modal);
}

async function showDescriptionModal(interaction: ButtonInteraction): Promise<void> {
    const modal = new ModalBuilder()
        .setCustomId('ticket_description_modal')
        .setTitle('Ticket Description');

    const descriptionInput = new TextInputBuilder()
        .setCustomId('description_input')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Provide detailed information about your issue or request...')
        .setRequired(true)
        .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput));
    await interaction.showModal(modal);
}

async function showContactModal(interaction: ButtonInteraction): Promise<void> {
    const modal = new ModalBuilder()
        .setCustomId('ticket_contact_modal')
        .setTitle('Contact Information');

    const contactInput = new TextInputBuilder()
        .setCustomId('contact_input')
        .setLabel('Contact Information')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Discord username, email, or preferred contact method')
        .setRequired(true)
        .setMaxLength(200);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(contactInput));
    await interaction.showModal(modal);
}

async function submitTicket(buttonInteraction: ButtonInteraction, ticketData: any): Promise<void> {
    const ticketCategoryId = process.env.TICKETS_CATEGORY_ID;
    
    if (!ticketCategoryId) {
        console.error('Error creating vouch ticket: Error: Tickets category ID not configured');
        await buttonInteraction.reply({
            content: "❌ Tickets category ID not configured! Please contact an administrator to set TICKETS_CATEGORY_ID in the environment variables.",
            ephemeral: true
        });
        return;
    }

    const guild = buttonInteraction.guild;
    if (!guild) {
        await buttonInteraction.reply({
            content: "❌ This command can only be used in a server!",
            ephemeral: true
        });
        return;
    }

    const ticketId = await getNextTicketNumber();
    const db = getDatabase();
    
    const ticketEmbed = new EmbedBuilder()
        .setTitle(`🎫 Server Support Ticket #${ticketId}`)
        .setDescription(`**Ticket ID:** \`#${ticketId}\`\n**Status:** 🟡 Open`)
        .setColor(getColorForPriority(ticketData.priority || 'medium'))
        .addFields([
            {
                name: "📂 **Category**",
                value: `${getCategoryEmoji(ticketData.category || 'other')} \`${formatCategoryName(ticketData.category || 'other')}\``,
                inline: true
            },
            {
                name: "⚡ **Priority**",
                value: `${getPriorityEmoji(ticketData.priority || 'medium')} \`${(ticketData.priority || 'medium').charAt(0).toUpperCase() + (ticketData.priority || 'medium').slice(1)}\``,
                inline: true
            },
            {
                name: "📞 **Contact**",
                value: `\`${ticketData.contact || "Not provided"}\``,
                inline: true
            },
            {
                name: "📋 **Subject**",
                value: `\`${ticketData.subject || "Not specified"}\``,
                inline: false
            },
            {
                name: "📝 **Description**",
                value: `\`${ticketData.description || "Not specified"}\``,
                inline: false
            },
            {
                name: "👤 **Submitted by**",
                value: `${buttonInteraction.user} (\`${buttonInteraction.user.tag}\`)`,
                inline: false
            }
        ])
        .setFooter({ 
            text: `Server Support Ticket #${ticketId} • ${formatCategoryName(ticketData.category || 'other')}`,
            iconURL: buttonInteraction.client.user?.displayAvatarURL()
        })
        .setTimestamp();

    try {
        // Build permission overwrites
        const permissionOverwrites: any[] = [
            {
                id: guild.id,
                deny: ['ViewChannel']
            },
            {
                id: buttonInteraction.user.id,
                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
            }
        ];

        // Add manager roles to initial permissions
        const managerRoleIds = process.env.MANAGER_ROLE_IDS?.split(',') || [];
        for (const roleId of managerRoleIds) {
            if (roleId.trim()) {
                permissionOverwrites.push({
                    id: roleId.trim(),
                    allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages']
                });
            }
        }

        const ticketChannel = await guild.channels.create({
            name: `ticket-${ticketId}-${buttonInteraction.user.username}`,
            type: ChannelType.GuildText,
            parent: ticketCategoryId,
            reason: `Support ticket #${ticketId} created by ${buttonInteraction.user.tag}`,
            permissionOverwrites
        });

        const claimRow = new ActionRowBuilder<ButtonBuilder>().addComponents([
            new ButtonBuilder()
                .setCustomId('claim_ticket')
                .setLabel('Claim Ticket')
                .setEmoji('✋')
                .setStyle(ButtonStyle.Success),
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

        await ticketChannel.send({ embeds: [ticketEmbed], components: [claimRow] });

        try {
            await db.createTicket({
                ticket_number: ticketId,
                user_id: buttonInteraction.user.id,
                user_tag: buttonInteraction.user.tag,
                channel_id: ticketChannel.id,
                category: ticketData.category || 'other',
                subject: ticketData.subject || '',
                description: ticketData.description || '',
                priority: ticketData.priority || 'medium',
                contact: ticketData.contact || '',
                type: 'support',
                status: 'open'
            });
            
            cooldownManager.setCooldown(buttonInteraction.user.id, 'ticket');
        } catch (dbError) {
            console.error('Error saving ticket to database:', dbError);
        }
        
        const successEmbed = new EmbedBuilder()
            .setTitle("✅ Server Support Ticket Created!")
            .setDescription(`🎉 **Your server support ticket has been created successfully!**\n\n⏰ **Created:** <t:${Math.floor(Date.now() / 1000)}:R>\n🆔 **Ticket ID:** \`#${ticketId}\`\n📝 **Channel:** ${ticketChannel}\n📂 **Category:** ${formatCategoryName(ticketData.category || 'other')}\n⚡ **Priority:** ${(ticketData.priority || 'medium').charAt(0).toUpperCase() + (ticketData.priority || 'medium').slice(1)}\n\n*Please use the ticket channel to communicate with our support team.*`)
            .setColor(0x00ff00)
            .setThumbnail(buttonInteraction.client.user?.displayAvatarURL() || null)
            .setTimestamp();

        await buttonInteraction.reply({
            embeds: [successEmbed],
            ephemeral: true
        });
    } catch (error) {
        console.error('Error creating ticket:', error);
        await buttonInteraction.reply({
            content: "❌ Failed to create ticket. Please check if I have proper permissions to create channels and manage the ticket category.",
            ephemeral: true
        });
    }
}

async function cancelTicket(buttonInteraction: ButtonInteraction): Promise<void> {
    const cancelEmbed = new EmbedBuilder()
        .setTitle("❌ Ticket Cancelled")
        .setDescription("🚫 **Your server support ticket creation has been cancelled.**\n\n💡 *Use `/ticket` again if you need to create a server support ticket.*")
        .setColor(0xff6b6b)
        .setFooter({ text: "Server support ticket creation cancelled by user" })
        .setTimestamp();

    await buttonInteraction.deferUpdate();
    await buttonInteraction.editReply({
        embeds: [cancelEmbed],
        components: []
    });
}

async function getNextTicketNumber(): Promise<string> {
    const ticketFilePath = require('path').join(__dirname, '..', '..', '..', 'databases', 'ticket-number.txt');
    const fs = require('fs');
    
    try {
        let currentNumber = 1;
        
        if (fs.existsSync(ticketFilePath)) {
            const fileContent = fs.readFileSync(ticketFilePath, 'utf8').trim();
            currentNumber = parseInt(fileContent) || 1;
        }
        
        const nextNumber = currentNumber + 1;
        fs.writeFileSync(ticketFilePath, nextNumber.toString());
        
        return currentNumber.toString().padStart(4, '0');
    } catch (error) {
        console.error('Error managing ticket number:', error);
        return Date.now().toString().slice(-4);
    }
}

function getPriorityEmoji(priority: string): string {
    switch (priority.toLowerCase()) {
        case 'low': return '🟢';
        case 'medium': return '🟡';
        case 'high': return '🟠';
        case 'critical': return '🔴';
        default: return '⚪';
    }
}

function getCategoryEmoji(category: string): string {
    switch (category.toLowerCase()) {
        case 'technical': return '🔧';
        case 'general': return '❓';
        case 'feature': return '💡';
        case 'billing': return '💳';
        case 'moderation': return '🛡️';
        case 'other': return '📝';
        default: return '📂';
    }
}

function formatCategoryName(category: string): string {
    switch (category.toLowerCase()) {
        case 'technical': return 'Technical Support';
        case 'general': return 'General Support';
        case 'feature': return 'Feature Request';
        case 'billing': return 'Billing Support';
        case 'moderation': return 'Moderation Issue';
        case 'other': return 'Other';
        default: return category.charAt(0).toUpperCase() + category.slice(1);
    }
}

function getColorForPriority(priority: string): number {
    switch (priority.toLowerCase()) {
        case 'low': return 0x00ff00;
        case 'medium': return 0xffff00;
        case 'high': return 0xff8000;
        case 'critical': return 0xff0000;
        default: return 0x5865f2;
    }
}