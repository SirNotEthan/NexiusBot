import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    User
} from 'discord.js';
import { getDatabase, TicketRecord } from '../../database';

const data = new SlashCommandBuilder()
    .setName("tickets")
    .setDescription("Manage and view tickets")
    .addSubcommand(subcommand =>
        subcommand
            .setName("list")
            .setDescription("List tickets")
            .addStringOption(option =>
                option
                    .setName("status")
                    .setDescription("Filter by ticket status")
                    .addChoices(
                        { name: "All", value: "all" },
                        { name: "Open", value: "open" },
                        { name: "Claimed", value: "claimed" },
                        { name: "Closed", value: "closed" }
                    )
                    .setRequired(false)
            )
            .addUserOption(option =>
                option
                    .setName("user")
                    .setDescription("Filter by user")
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName("view")
            .setDescription("View a specific ticket")
            .addStringOption(option =>
                option
                    .setName("ticket_id")
                    .setDescription("The ticket ID (e.g., 0001)")
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName("stats")
            .setDescription("Show ticket statistics")
    );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    try {
        switch (subcommand) {
            case 'list':
                await handleListTickets(interaction);
                break;
            case 'view':
                await handleViewTicket(interaction);
                break;
            case 'stats':
                await handleTicketStats(interaction);
                break;
            default:
                await interaction.reply({
                    content: "❌ Unknown subcommand.",
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error("Error in tickets command:", error);
        await interaction.reply({
            content: "❌ An error occurred while processing your request.",
            ephemeral: true
        });
    }
}

async function handleListTickets(interaction: ChatInputCommandInteraction): Promise<void> {
    const db = getDatabase();
    const status = interaction.options.getString("status") || "all";
    const user = interaction.options.getUser("user");

    let tickets: TicketRecord[];
    if (user) {
        tickets = await db.getTicketsByUser(user.id);
        if (status !== "all") {
            tickets = tickets.filter(ticket => ticket.status === status);
        }
    } else {
        tickets = status === "all" ? await db.getAllTickets() : await db.getAllTickets(status as any);
    }

    if (tickets.length === 0) {
        const filterText = user ? ` for ${user}` : "";
        const statusText = status === "all" ? "" : ` with status "${status}"`;
        
        await interaction.reply({
            content: `📂 No tickets found${filterText}${statusText}.`,
            ephemeral: true
        });
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle("🎫 Ticket List")
        .setColor(0x5865f2)
        .setTimestamp();

    const filterText = user ? ` for ${user}` : "";
    const statusText = status === "all" ? "" : ` (${status.toUpperCase()})`;
    embed.setDescription(`**Found ${tickets.length} ticket(s)${filterText}${statusText}**\n`);

    const ticketChunks = chunkArray(tickets, 10);
    const firstChunk = ticketChunks[0];

    let description = embed.data.description || "";
    firstChunk.forEach(ticket => {
        const statusEmoji = getStatusEmoji(ticket.status);
        const createdAt = Math.floor(ticket.created_at / 1000);
        const subject = ticket.subject.length > 20 ? `${ticket.subject.substring(0, 20)}...` : ticket.subject;
        const priorityEmoji = getPriorityEmoji(ticket.priority);
        
        description += `\n${statusEmoji} **#${ticket.ticket_number}** - ${subject}`;
        description += `\n   👤 <@${ticket.user_id}> • ${priorityEmoji} ${ticket.priority.toUpperCase()} • <t:${createdAt}:R>`;
        if (ticket.claimed_by) {
            description += ` • 🤝 <@${ticket.claimed_by}>`;
        }
    });

    embed.setDescription(description);
    embed.setFooter({ text: `Showing ${firstChunk.length} of ${tickets.length} tickets` });

    const components: ActionRowBuilder<any>[] = [];

    if (ticketChunks.length > 1) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_page_select')
            .setPlaceholder('Select a page to view more tickets...');

        ticketChunks.forEach((chunk, index) => {
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(`Page ${index + 1} (${chunk.length} tickets)`)
                    .setDescription(`Tickets ${index * 10 + 1} - ${index * 10 + chunk.length}`)
                    .setValue(`page_${index}`)
            );
        });

        components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
    }

    await interaction.reply({
        embeds: [embed],
        components,
        ephemeral: true
    });
}

async function handleViewTicket(interaction: ChatInputCommandInteraction): Promise<void> {
    const ticketId = interaction.options.getString("ticket_id", true);
    const db = getDatabase();

    const ticket = await db.getTicket(ticketId.padStart(4, '0'));
    
    if (!ticket) {
        await interaction.reply({
            content: `❌ Ticket #${ticketId} not found.`,
            ephemeral: true
        });
        return;
    }

    const statusEmoji = getStatusEmoji(ticket.status);
    const statusText = ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1);

    const embed = new EmbedBuilder()
        .setTitle(`🎫 Ticket #${ticket.ticket_number}`)
        .setDescription(`**Status:** ${statusEmoji} ${statusText}`)
        .setColor(getStatusColor(ticket.status))
        .addFields([
            {
                name: "📂 **Category**",
                value: `${getCategoryEmoji(ticket.category)} \`${formatCategoryName(ticket.category)}\``,
                inline: true
            },
            {
                name: "⚡ **Priority**",
                value: `${getPriorityEmoji(ticket.priority)} \`${ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}\``,
                inline: true
            },
            {
                name: "📞 **Contact**",
                value: `\`${ticket.contact}\``,
                inline: true
            },
            {
                name: "📋 **Subject**",
                value: `\`${ticket.subject}\``,
                inline: false
            },
            {
                name: "📝 **Description**",
                value: ticket.description.length > 200 ? `\`${ticket.description.substring(0, 200)}...\`` : `\`${ticket.description}\``,
                inline: false
            },
            {
                name: "👤 **Submitted by**",
                value: `<@${ticket.user_id}> (\`${ticket.user_tag}\`)`,
                inline: false
            },
            {
                name: "⏰ **Created**",
                value: `<t:${Math.floor(ticket.created_at / 1000)}:F> (<t:${Math.floor(ticket.created_at / 1000)}:R>)`,
                inline: false
            },
            {
                name: "🔄 **Last Updated**",
                value: `<t:${Math.floor(ticket.updated_at / 1000)}:F> (<t:${Math.floor(ticket.updated_at / 1000)}:R>)`,
                inline: false
            }
        ])
        .setTimestamp();

    if (ticket.claimed_by) {
        embed.addFields({
            name: "🤝 **Claimed by**",
            value: `<@${ticket.claimed_by}> (\`${ticket.claimed_by_tag}\`)`,
            inline: false
        });
    }

    if (ticket.closed_at) {
        embed.addFields({
            name: "🔒 **Closed**",
            value: `<t:${Math.floor(ticket.closed_at / 1000)}:F> (<t:${Math.floor(ticket.closed_at / 1000)}:R>)`,
            inline: false
        });
    }

    const buttons: ButtonBuilder[] = [];

    if (ticket.channel_id) {
        buttons.push(
            new ButtonBuilder()
                .setLabel('Go to Channel')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${interaction.guildId}/${ticket.channel_id}`)
                .setEmoji('🔗')
        );
    }

    const components = buttons.length > 0 ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [];

    await interaction.reply({
        embeds: [embed],
        components,
        ephemeral: true
    });
}

async function handleTicketStats(interaction: ChatInputCommandInteraction): Promise<void> {
    const db = getDatabase();
    
    const [allTickets, openTickets, claimedTickets, closedTickets] = await Promise.all([
        db.getAllTickets(),
        db.getAllTickets('open'),
        db.getAllTickets('claimed'),
        db.getAllTickets('closed')
    ]);

    const totalTickets = allTickets.length;
    const averageResponseTime = calculateAverageResponseTime(allTickets);
    const topCategories = getTopCategories(allTickets);
    const priorityBreakdown = getPriorityBreakdown(allTickets);

    const embed = new EmbedBuilder()
        .setTitle("📊 Ticket Statistics")
        .setColor(0x5865f2)
        .addFields([
            {
                name: "📈 **Overview**",
                value: [
                    `**Total Tickets:** ${totalTickets}`,
                    `🟡 **Open:** ${openTickets.length}`,
                    `🟢 **Claimed:** ${claimedTickets.length}`,
                    `🔴 **Closed:** ${closedTickets.length}`
                ].join('\n'),
                inline: true
            },
            {
                name: "📊 **Percentages**",
                value: totalTickets > 0 ? [
                    `🟡 **Open:** ${((openTickets.length / totalTickets) * 100).toFixed(1)}%`,
                    `🟢 **Claimed:** ${((claimedTickets.length / totalTickets) * 100).toFixed(1)}%`,
                    `🔴 **Closed:** ${((closedTickets.length / totalTickets) * 100).toFixed(1)}%`
                ].join('\n') : 'No tickets yet',
                inline: true
            },
            {
                name: "📂 **Top Categories**",
                value: topCategories.length > 0 ? topCategories.map((item, index) => 
                    `${index + 1}. ${getCategoryEmoji(item.category)} **${formatCategoryName(item.category)}** (${item.count} tickets)`
                ).join('\n') : 'No data available',
                inline: false
            },
            {
                name: "⚡ **Priority Breakdown**",
                value: priorityBreakdown.length > 0 ? priorityBreakdown.map(item => 
                    `${getPriorityEmoji(item.priority)} **${item.priority.toUpperCase()}:** ${item.count} (${item.percentage}%)`
                ).join('\n') : 'No data available',
                inline: false
            }
        ])
        .setTimestamp();

    if (averageResponseTime) {
        embed.addFields({
            name: "⚡ **Average Response Time**",
            value: averageResponseTime,
            inline: true
        });
    }

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

function getStatusEmoji(status: string): string {
    switch (status) {
        case 'open': return '🟡';
        case 'claimed': return '🟢';
        case 'closed': return '🔴';
        default: return '⚪';
    }
}

function getStatusColor(status: string): number {
    switch (status) {
        case 'open': return 0x5865f2;
        case 'claimed': return 0x00ff00;
        case 'closed': return 0xff0000;
        default: return 0x99aab5;
    }
}

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

function calculateAverageResponseTime(tickets: TicketRecord[]): string | null {
    const claimedTickets = tickets.filter(t => t.claimed_by && t.created_at);
    
    if (claimedTickets.length === 0) return null;

    const totalResponseTime = claimedTickets.reduce((sum, ticket) => {
        return sum + (ticket.updated_at - ticket.created_at);
    }, 0);

    const averageMs = totalResponseTime / claimedTickets.length;
    const averageHours = Math.round(averageMs / (1000 * 60 * 60));

    if (averageHours < 1) {
        const averageMinutes = Math.round(averageMs / (1000 * 60));
        return `${averageMinutes} minute(s)`;
    }

    return `${averageHours} hour(s)`;
}

function getTopCategories(tickets: TicketRecord[]): Array<{ category: string, count: number }> {
    const categoryMap = new Map<string, number>();
    
    tickets.forEach(ticket => {
        const category = ticket.category;
        categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
    });

    return Array.from(categoryMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
}

function getPriorityBreakdown(tickets: TicketRecord[]): Array<{ priority: string, count: number, percentage: number }> {
    const priorityMap = new Map<string, number>();
    const total = tickets.length;
    
    if (total === 0) return [];
    
    tickets.forEach(ticket => {
        const priority = ticket.priority;
        priorityMap.set(priority, (priorityMap.get(priority) || 0) + 1);
    });

    return Array.from(priorityMap.entries())
        .map(([priority, count]) => ({ 
            priority, 
            count, 
            percentage: Math.round((count / total) * 100) 
        }))
        .sort((a, b) => {
            const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
            return (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 4) - (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 4);
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

export default { data, execute };