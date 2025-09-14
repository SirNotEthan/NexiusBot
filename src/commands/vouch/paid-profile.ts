import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    EmbedBuilder,
    User
} from 'discord.js';
import Database from '../../database/database';
import { displayHelperProfile } from './profile';

const data = new SlashCommandBuilder()
    .setName("paid-profile")
    .setDescription("Display paid helper profile information")
    .addUserOption(option =>
        option.setName('user')
            .setDescription('User to view paid profile for (defaults to yourself)')
            .setRequired(false)
    );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        
        const db = new Database();
        await db.connect();
        
        try {
            const helper = await db.getHelper(targetUser.id);
            const paidHelper = await db.getPaidHelper(targetUser.id);
            
            if (!helper || !helper.is_paid_helper || !paidHelper) {
                const embed = new EmbedBuilder()
                    .setTitle("❌ Paid Helper Profile Not Found")
                    .setDescription(`${targetUser.tag} is not registered as a paid helper.`)
                    .setColor(0xff6b6b);
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            const paidVouches = await db.getHelperVouches(targetUser.id);
            const paidVouchesFiltered = paidVouches.filter(v => v.type === 'paid');
            const recentPaidVouches = paidVouchesFiltered.slice(0, 3);
            
            const weeklyPaidVouches = await db.getHelperVouchesByTimeframe(targetUser.id, 'weekly');
            const weeklyPaidFiltered = weeklyPaidVouches.filter(v => v.type === 'paid');
            
            const monthlyPaidVouches = await db.getHelperVouchesByTimeframe(targetUser.id, 'monthly');
            const monthlyPaidFiltered = monthlyPaidVouches.filter(v => v.type === 'paid');
            
            const daysSinceBioSet = Math.floor((Date.now() - paidHelper.bio_set_date) / (1000 * 60 * 60 * 24));
            const bioExpiresIn = 7 - daysSinceBioSet;
            
            const embed = new EmbedBuilder()
                .setTitle(`💳 ${targetUser.username}'s Paid Helper Profile`)
                .setThumbnail(targetUser.displayAvatarURL())
                .setColor(0x00d4aa)
                .addFields([
                    { 
                        name: '💼 Bio', 
                        value: paidHelper.bio || 'No bio set', 
                        inline: false 
                    },
                    { 
                        name: '📅 Bio Set', 
                        value: `${daysSinceBioSet} days ago`, 
                        inline: true 
                    },
                    { 
                        name: '⏰ Bio Expires', 
                        value: bioExpiresIn > 0 ? `In ${bioExpiresIn} days` : 'Expired', 
                        inline: true 
                    },
                    { 
                        name: '🎯 Access Vouches', 
                        value: `${paidHelper.vouches_for_access}/10 required`, 
                        inline: true 
                    },
                    { 
                        name: '💰 Total Paid Vouches', 
                        value: paidVouchesFiltered.length.toString(), 
                        inline: true 
                    },
                    { 
                        name: '📊 Weekly Paid Vouches', 
                        value: weeklyPaidFiltered.length.toString(), 
                        inline: true 
                    },
                    { 
                        name: '📈 Monthly Paid Vouches', 
                        value: monthlyPaidFiltered.length.toString(), 
                        inline: true 
                    }
                ]);

            if (recentPaidVouches.length > 0) {
                const vouchText = recentPaidVouches.map((vouch, index) => {
                    const stars = '⭐'.repeat(vouch.rating);
                    const date = new Date(vouch.created_at).toLocaleDateString();
                    const compensation = vouch.compensation ? ` | 💰 ${vouch.compensation}` : '';
                    return `**${index + 1}.** ${stars} (${vouch.rating}/5) - ${date}${compensation}\n*"${vouch.reason.substring(0, 80)}${vouch.reason.length > 80 ? '...' : ''}"*`;
                }).join('\n\n');
                
                embed.addFields([
                    { 
                        name: '💳 Recent Paid Vouches', 
                        value: vouchText, 
                        inline: false 
                    }
                ]);
            }

            const statusEmoji = bioExpiresIn > 0 ? '🟢' : '🔴';
            embed.setFooter({ 
                text: `${statusEmoji} ${bioExpiresIn > 0 ? 'Active on tracker board' : 'Not on tracker board - bio expired'}` 
            });

            await interaction.reply({ embeds: [embed] });

        } finally {
            await db.close();
        }
        
    } catch (error) {
        console.error("Error in paid-profile command:", error);
        await handleProfileError(interaction, error);
    }
}

async function handleProfileError(interaction: ChatInputCommandInteraction, error: any): Promise<void> {
    console.error("Paid profile command error:", error);
    
    try {
        const errorMessage = "❌ Failed to load paid profile. Please try again later.";
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    } catch (followUpError) {
        console.error("Failed to send paid profile error message:", followUpError);
    }
}

export default { data, execute };