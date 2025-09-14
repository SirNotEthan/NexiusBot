import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder
} from 'discord.js';
import Database from '../../database/database';

const data = new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Display helper leaderboards")
    .addStringOption(option =>
        option.setName('type')
            .setDescription('Type of leaderboard')
            .setRequired(true)
            .addChoices(
                { name: 'Regular Helpers', value: 'regular' },
                { name: 'Paid Helpers', value: 'paid' }
            )
    )
    .addStringOption(option =>
        option.setName('timeframe')
            .setDescription('Timeframe for leaderboard')
            .setRequired(false)
            .addChoices(
                { name: 'Weekly', value: 'weekly' },
                { name: 'Monthly', value: 'monthly' },
                { name: 'Overall', value: 'overall' }
            )
    );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        const type = interaction.options.getString('type', true) as 'regular' | 'paid';
        const timeframe = interaction.options.getString('timeframe') as 'weekly' | 'monthly' | 'overall' || 'overall';
        
        await displayLeaderboard(interaction, type, timeframe);
    } catch (error) {
        console.error("Error in leaderboard command:", error);
        await handleLeaderboardError(interaction, error);
    }
}

async function displayLeaderboard(
    interaction: ChatInputCommandInteraction, 
    type: 'regular' | 'paid', 
    timeframe: 'weekly' | 'monthly' | 'overall'
): Promise<void> {
    const db = new Database();
    await db.connect();
    
    try {
        const topHelpers = await db.getTopHelpers(type, timeframe, 15);
        
        if (topHelpers.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle("📊 No Data Available")
                .setDescription(`No ${type} helpers found for the ${timeframe} leaderboard.`)
                .setColor(0x99aab5);
            
            await interaction.reply({ embeds: [embed] });
            return;
        }

        const embed = createLeaderboardEmbed(topHelpers, type, timeframe);
        const components = createLeaderboardComponents(type, timeframe, interaction.user.id);

        await interaction.reply({
            embeds: [embed],
            components: components
        });

    } finally {
        await db.close();
    }
}

function createLeaderboardEmbed(
    helpers: any[], 
    type: 'regular' | 'paid', 
    timeframe: 'weekly' | 'monthly' | 'overall'
): EmbedBuilder {
    const emoji = type === 'paid' ? '💳' : '🏆';
    const typeLabel = type === 'paid' ? 'Paid Helper' : 'Helper';
    const timeframeLabel = timeframe.charAt(0).toUpperCase() + timeframe.slice(1);
    
    const embed = new EmbedBuilder()
        .setTitle(`${emoji} ${typeLabel} Leaderboard - ${timeframeLabel}`)
        .setColor(type === 'paid' ? 0x00d4aa : 0x5865f2)
        .setTimestamp();

    let description = '';
    const medals = ['🥇', '🥈', '🥉'];
    
    helpers.forEach((helper, index) => {
        const medal = index < 3 ? medals[index] : `**${index + 1}.**`;
        const vouchCount = timeframe === 'overall' ? helper.total_vouches : helper.vouch_count;
        const rating = timeframe === 'overall' 
            ? helper.average_rating.toFixed(1) 
            : (helper.avg_rating || 0).toFixed(1);
        
        description += `${medal} **${helper.user_tag}**\n`;
        description += `   📊 ${vouchCount} vouches | ⭐ ${rating}/5.0\n\n`;
    });

    embed.setDescription(description);

    const now = new Date();
    let footerText = '';
    
    switch (timeframe) {
        case 'weekly':
            const weekStart = new Date(now.getTime() - (now.getDay() * 24 * 60 * 60 * 1000));
            weekStart.setHours(0, 0, 0, 0);
            footerText = `Week starting ${weekStart.toLocaleDateString()}`;
            break;
        case 'monthly':
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            footerText = `Month of ${monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
            break;
        case 'overall':
            footerText = 'All-time statistics';
            break;
    }
    
    embed.setFooter({ text: footerText });

    return embed;
}

function createLeaderboardComponents(
    type: 'regular' | 'paid',
    currentTimeframe: 'weekly' | 'monthly' | 'overall',
    userId: string
): ActionRowBuilder<ButtonBuilder>[] {
    const weeklyButton = new ButtonBuilder()
        .setCustomId(`leaderboard_${type}_weekly_${userId}`)
        .setLabel('Weekly')
        .setStyle(currentTimeframe === 'weekly' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setEmoji('📅');

    const monthlyButton = new ButtonBuilder()
        .setCustomId(`leaderboard_${type}_monthly_${userId}`)
        .setLabel('Monthly')
        .setStyle(currentTimeframe === 'monthly' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setEmoji('📈');

    const overallButton = new ButtonBuilder()
        .setCustomId(`leaderboard_${type}_overall_${userId}`)
        .setLabel('Overall')
        .setStyle(currentTimeframe === 'overall' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setEmoji('🏆');

    const typeButton = new ButtonBuilder()
        .setCustomId(`leaderboard_${type === 'regular' ? 'paid' : 'regular'}_${currentTimeframe}_${userId}`)
        .setLabel(type === 'regular' ? 'Switch to Paid' : 'Switch to Regular')
        .setStyle(ButtonStyle.Success)
        .setEmoji(type === 'regular' ? '💳' : '🏅');

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents([
        weeklyButton, monthlyButton, overallButton
    ]);

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents([typeButton]);

    return [row1, row2];
}

export async function updateLeaderboard(
    interaction: any,
    type: 'regular' | 'paid',
    timeframe: 'weekly' | 'monthly' | 'overall'
): Promise<void> {
    const db = new Database();
    await db.connect();
    
    try {
        const topHelpers = await db.getTopHelpers(type, timeframe, 15);
        
        if (topHelpers.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle("📊 No Data Available")
                .setDescription(`No ${type} helpers found for the ${timeframe} leaderboard.`)
                .setColor(0x99aab5);
            
            await interaction.editReply({ embeds: [embed], components: [] });
            return;
        }

        const embed = createLeaderboardEmbed(topHelpers, type, timeframe);
        const components = createLeaderboardComponents(type, timeframe, interaction.user.id);

        await interaction.editReply({
            embeds: [embed],
            components: components
        });

    } finally {
        await db.close();
    }
}

async function handleLeaderboardError(interaction: ChatInputCommandInteraction, error: any): Promise<void> {
    console.error("Leaderboard command error:", error);
    
    try {
        const errorMessage = "❌ Failed to load leaderboard. Please try again later.";
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    } catch (followUpError) {
        console.error("Failed to send leaderboard error message:", followUpError);
    }
}

export default { data, execute };