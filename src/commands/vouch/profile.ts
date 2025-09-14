import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    EmbedBuilder,
    User
} from 'discord.js';
import Database from '../../database/database';

const data = new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Display helper profile information")
    .addUserOption(option =>
        option.setName('user')
            .setDescription('User to view profile for (defaults to yourself)')
            .setRequired(false)
    );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        await displayHelperProfile(interaction, targetUser, 'regular');
    } catch (error) {
        console.error("Error in profile command:", error);
        await handleProfileError(interaction, error);
    }
}

async function displayHelperProfile(interaction: ChatInputCommandInteraction, user: User, type: 'regular' | 'paid'): Promise<void> {
    const db = new Database();
    await db.connect();
    
    try {
        const helper = await db.getHelper(user.id);
        
        if (!helper) {
            const embed = new EmbedBuilder()
                .setTitle("❌ Helper Profile Not Found")
                .setDescription(`${user.tag} is not registered as a helper.`)
                .setColor(0xff6b6b);
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        const recentVouches = await db.getHelperVouches(user.id, 3);
        const weeklyVouches = await db.getHelperVouchesByTimeframe(user.id, 'weekly');
        const monthlyVouches = await db.getHelperVouchesByTimeframe(user.id, 'monthly');
        
        const daysSinceLastVouch = helper.last_vouch_date 
            ? Math.floor((Date.now() - helper.last_vouch_date) / (1000 * 60 * 60 * 24))
            : null;
        
        const daysSinceHelper = Math.floor((Date.now() - helper.helper_since) / (1000 * 60 * 60 * 24));

        const embed = new EmbedBuilder()
            .setTitle(`${type === 'paid' ? '💳' : '🏅'} ${user.username}'s ${type === 'paid' ? 'Paid ' : ''}Helper Profile`)
            .setThumbnail(user.displayAvatarURL())
            .setColor(type === 'paid' ? 0x00d4aa : 0x5865f2)
            .addFields([
                { 
                    name: '🏆 Helper Rank', 
                    value: helper.helper_rank, 
                    inline: true 
                },
                { 
                    name: '📊 Leaderboard Rank', 
                    value: 'Loading...', 
                    inline: true 
                },
                { 
                    name: '⭐ Average Rating', 
                    value: `${helper.average_rating.toFixed(1)}/5.0`, 
                    inline: true 
                },
                { 
                    name: '📈 Total Vouches', 
                    value: helper.total_vouches.toString(), 
                    inline: true 
                },
                { 
                    name: '📅 Last Vouch', 
                    value: daysSinceLastVouch !== null 
                        ? `${daysSinceLastVouch} days ago` 
                        : 'Never', 
                    inline: true 
                },
                { 
                    name: '🕐 Helper Since', 
                    value: `${daysSinceHelper} days ago`, 
                    inline: true 
                },
                { 
                    name: '📊 Weekly Vouches', 
                    value: weeklyVouches.length.toString(), 
                    inline: true 
                },
                { 
                    name: '📈 Monthly Vouches', 
                    value: monthlyVouches.length.toString(), 
                    inline: true 
                },
                { 
                    name: '🎯 Weekly Goal', 
                    value: `${weeklyVouches.length}/10 vouches`, 
                    inline: true 
                }
            ]);

        if (recentVouches.length > 0) {
            const vouchText = recentVouches.map((vouch, index) => {
                const stars = '⭐'.repeat(vouch.rating);
                const date = new Date(vouch.created_at).toLocaleDateString();
                return `**${index + 1}.** ${stars} (${vouch.rating}/5) - ${date}\n*"${vouch.reason.substring(0, 100)}${vouch.reason.length > 100 ? '...' : ''}"*`;
            }).join('\n\n');
            
            embed.addFields([
                { 
                    name: '📝 Recent Vouches', 
                    value: vouchText, 
                    inline: false 
                }
            ]);
        }

        const statusColor = weeklyVouches.length >= 10 ? '🟢' : weeklyVouches.length >= 7 ? '🟡' : '🔴';
        embed.setFooter({ 
            text: `${statusColor} ${weeklyVouches.length >= 10 ? 'Meeting' : 'Not meeting'} weekly vouch requirement` 
        });

        await interaction.reply({ embeds: [embed] });

    } finally {
        await db.close();
    }
}

async function handleProfileError(interaction: ChatInputCommandInteraction, error: any): Promise<void> {
    console.error("Profile command error:", error);
    
    try {
        const errorMessage = "❌ Failed to load profile. Please try again later.";
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    } catch (followUpError) {
        console.error("Failed to send profile error message:", followUpError);
    }
}

export default { data, execute };
export { displayHelperProfile };