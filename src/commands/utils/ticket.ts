import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ComponentType,
    ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ModalSubmitInteraction,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    StringSelectMenuInteraction,
    ChannelSelectMenuBuilder,
    ChannelType
} from 'discord.js';
import { cooldownManager } from '../../utils/cooldownManager';

interface TicketData {
    category?: string;
    subject?: string;
    description?: string;
    priority?: string;
    contact?: string;
}

const data = new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Create a server support ticket");

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        if (cooldownManager.isOnCooldown(interaction.user.id, 'ticket')) {
            const remainingTime = cooldownManager.getRemainingCooldown(interaction.user.id, 'ticket');
            const timeString = cooldownManager.formatRemainingTime(remainingTime);
            
            await interaction.reply({
                content: `⏰ **Please wait ${timeString}** before using the ticket command again.\n\n*This prevents form spam while your previous ticket is being processed.*`,
                ephemeral: true
            });
            return;
        }

        const ticketData: TicketData = {};
        const embed = createTicketEmbed(ticketData);
        const components = createTicketComponents(ticketData);

        await interaction.reply({
            embeds: [embed],
            components: components,
            ephemeral: true
        });

        setupComponentCollectors(interaction, ticketData);
    } catch (error) {
        console.error("Error in ticket command:", error);
        await handleTicketError(interaction, error);
    }
}

function createTicketEmbed(ticketData: TicketData): EmbedBuilder {
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

function createTicketComponents(ticketData: TicketData): ActionRowBuilder<any>[] {
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

function setupComponentCollectors(interaction: ChatInputCommandInteraction, ticketData: TicketData): void {
    const collector = interaction.channel?.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id,
        time: 300000
    });

    collector?.on('collect', async (componentInteraction) => {
    });

    collector?.on('end', async () => {
        try {
            const expiredEmbed = new EmbedBuilder()
                .setTitle("⏰ Support Ticket Form Expired")
                .setDescription("📋 **This support ticket form has expired due to inactivity.**\n\n🔄 Use `/ticket` again to create a new server support ticket.\n\n*Tip: Complete your ticket form within 5 minutes to avoid expiration.*")
                .setColor(0xff6b6b)
                .setFooter({ text: "Session expired after 5 minutes of inactivity" })
                .setTimestamp();

            await interaction.editReply({
                embeds: [expiredEmbed],
                components: []
            });
        } catch (error) {
            console.error('Error updating expired ticket:', error);
        }
    });
}

async function handleSelectMenu(
    selectInteraction: StringSelectMenuInteraction, 
    ticketData: TicketData, 
    originalInteraction: ChatInputCommandInteraction
): Promise<void> {
    const { customId, values } = selectInteraction;

    await updateTicketEmbed(selectInteraction, ticketData, originalInteraction);
}

async function updateTicketEmbed(
    componentInteraction: any, 
    ticketData: TicketData, 
    originalInteraction: ChatInputCommandInteraction
): Promise<void> {
    const embed = createTicketEmbed(ticketData);
    const components = createTicketComponents(ticketData);

    await componentInteraction.deferUpdate();
    await originalInteraction.editReply({
        embeds: [embed],
        components: components
    });
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
        default: return 0x0099ff;
    }
}

async function handleTicketError(interaction: ChatInputCommandInteraction, error: any): Promise<void> {
    console.error("Ticket command error:", error);
    
    try {
        const errorMessage = "❌ Failed to create ticket form. Please try again later.";
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    } catch (followUpError) {
        console.error("Failed to send ticket error message:", followUpError);
    }
}

export default { data, execute };