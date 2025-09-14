import { ModalSubmitInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export async function handleTicketModals(interaction: ModalSubmitInteraction): Promise<void> {
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
                    ticketData.category = field.value.replace(/`/g, '').replace(/^[^ ]+ /, '').trim().toLowerCase();
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

    switch (interaction.customId) {
        case 'ticket_category_modal':
            const categoryInput = interaction.fields.getTextInputValue('category_input').toLowerCase().trim();
            const validCategories = ['technical', 'general', 'feature', 'billing', 'moderation', 'other'];
            ticketData.category = validCategories.includes(categoryInput) ? categoryInput : 'other';
            break;
        case 'ticket_subject_modal':
            ticketData.subject = interaction.fields.getTextInputValue('subject_input');
            break;
        case 'ticket_priority_modal':
            const priorityInput = interaction.fields.getTextInputValue('priority_input').toLowerCase().trim();
            const validPriorities = ['low', 'medium', 'high', 'critical'];
            ticketData.priority = validPriorities.includes(priorityInput) ? priorityInput : 'medium';
            break;
        case 'ticket_description_modal':
            ticketData.description = interaction.fields.getTextInputValue('description_input');
            break;
        case 'ticket_contact_modal':
            ticketData.contact = interaction.fields.getTextInputValue('contact_input');
            break;
    }

    await updateTicketForm(interaction, ticketData);
}

async function updateTicketForm(interaction: ModalSubmitInteraction, ticketData: any): Promise<void> {
    const embed = createTicketEmbed(ticketData);
    const components = createTicketComponents(ticketData);

    await interaction.deferUpdate();
    await interaction.editReply({
        embeds: [embed],
        components: components
    });
}

function createTicketEmbed(ticketData: any): EmbedBuilder {
    const completedFields = [
        ticketData.category, ticketData.subject, ticketData.description, ticketData.priority, ticketData.contact
    ].filter(Boolean).length;
    
    const totalFields = 5;
    const progressBar = "▓".repeat(completedFields) + "░".repeat(totalFields - completedFields);
    
    const embed = new EmbedBuilder()
        .setTitle("🎫 Create Server Support Ticket")
        .setDescription(`**Progress:** ${completedFields}/${totalFields} ${progressBar}\n\n*Fill out the form below to create your server support ticket. Click the buttons to add information.*`)
        .setColor(completedFields === totalFields ? 0x00ff00 : 0x5865f2)
        .addFields([
            {
                name: "📂 **Category**",
                value: ticketData.category ? `\`${formatCategoryName(ticketData.category)}\`` : "❌ *Not set*",
                inline: true
            },
            {
                name: "📋 **Subject**",
                value: ticketData.subject 
                    ? (ticketData.subject.length > 50 ? `\`${ticketData.subject.substring(0, 50)}...\`` : `\`${ticketData.subject}\``)
                    : "❌ *Not set*",
                inline: true
            },
            {
                name: "⚡ **Priority**",
                value: ticketData.priority ? `${getPriorityEmoji(ticketData.priority)} \`${ticketData.priority.charAt(0).toUpperCase() + ticketData.priority.slice(1)}\`` : "❌ *Not set*",
                inline: true
            },
            {
                name: "📝 **Description**",
                value: ticketData.description 
                    ? (ticketData.description.length > 100 ? `\`${ticketData.description.substring(0, 100)}...\`` : `\`${ticketData.description}\``)
                    : "❌ *Not set*",
                inline: false
            },
            {
                name: "📞 **Contact Info**",
                value: ticketData.contact ? `\`${ticketData.contact}\`` : "❌ *Not set*",
                inline: true
            }
        ])
        .setFooter({ 
            text: completedFields === totalFields 
                ? "✅ All fields completed! Ready to submit." 
                : `⏳ ${totalFields - completedFields} field(s) remaining to enable Submit button`
        })
        .setTimestamp();

    return embed;
}

function createTicketComponents(ticketData: any): ActionRowBuilder<any>[] {
    const isComplete = ticketData.category && ticketData.subject && ticketData.description && ticketData.priority && ticketData.contact;

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents([
        new ButtonBuilder()
            .setCustomId('ticket_category')
            .setLabel('Category')
            .setEmoji('📂')
            .setStyle(ticketData.category ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ticket_subject')
            .setLabel('Subject')
            .setEmoji('📋')
            .setStyle(ticketData.subject ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ticket_priority')
            .setLabel('Priority')
            .setEmoji('⚡')
            .setStyle(ticketData.priority ? ButtonStyle.Success : ButtonStyle.Secondary)
    ]);

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents([
        new ButtonBuilder()
            .setCustomId('ticket_description')
            .setLabel('Description')
            .setEmoji('📝')
            .setStyle(ticketData.description ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ticket_contact')
            .setLabel('Contact Info')
            .setEmoji('📞')
            .setStyle(ticketData.contact ? ButtonStyle.Success : ButtonStyle.Secondary)
    ]);

    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents([
        new ButtonBuilder()
            .setCustomId('ticket_submit')
            .setLabel('Submit Ticket')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!isComplete),
        new ButtonBuilder()
            .setCustomId('ticket_cancel')
            .setLabel('Cancel')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
    ]);

    return [row1, row2, row3];
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