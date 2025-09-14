import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Database from '../../database/database';

const data = new SlashCommandBuilder()
    .setName("helper-status")
    .setDescription("Check your current helper status and paid helper eligibility");

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    
    const db = new Database();
    await db.connect();
    
    try {
        const userId = interaction.user.id;
        const helper = await db.getHelper(userId);
        
        if (!helper) {
            const embed = new EmbedBuilder()
                .setTitle("❌ Not a Helper")
                .setDescription("You are not registered as a helper yet. Start helping users to become a helper!")
                .setColor(0xff6b6b)
                .addFields([
                    { name: "📝 How to Become a Helper", value: "1. Help users with their requests\n2. Receive your first vouch\n3. Get automatically registered as a helper", inline: false }
                ]);
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }
        
        const eligibility = await db.checkPaidHelperEligibility(userId);
        const recentVouches = await db.getHelperVouchesByTimeframe(userId, 'weekly');
        
        const embed = new EmbedBuilder()
            .setTitle("📊 Your Helper Status")
            .setThumbnail(interaction.user.displayAvatarURL())
            .setColor(helper.is_paid_helper ? 0x00d4aa : eligibility.eligible ? 0xffa500 : 0x5865f2)
            .setTimestamp();
        
        embed.addFields([
            {
                name: "📈 Overall Statistics",
                value: `**Total Vouches:** ${helper.total_vouches}\n**Weekly Vouches:** ${helper.weekly_vouches}\n**Monthly Vouches:** ${helper.monthly_vouches}\n**Average Rating:** ${helper.average_rating.toFixed(1)}/5 ⭐`,
                inline: false
            }
        ]);
        
        if (helper.is_paid_helper) {
            embed.addFields([
                {
                    name: "💳 Paid Helper Status",
                    value: "✅ **You are a paid helper!**\nYou can accept paid carry requests.",
                    inline: false
                }
            ]);
        } else {
            const progressBar = "▓".repeat(eligibility.currentVouches) + "░".repeat(Math.max(0, 10 - eligibility.currentVouches));
            
            embed.addFields([
                {
                    name: "🎯 Paid Helper Eligibility",
                    value: eligibility.eligible 
                        ? "✅ **You're eligible for paid helper status!**\nContact staff to set up your paid helper profile."
                        : `**Progress:** ${eligibility.currentVouches}/10 vouches this week\n\`${progressBar}\`\n\n**Vouches needed:** ${eligibility.vouchesNeeded} more regular vouches`,
                    inline: false
                }
            ]);
            
            if (!eligibility.eligible) {
                embed.addFields([
                    {
                        name: "📝 How to Become Eligible",
                        value: "• Help users with **regular** (free) carry requests\n• Earn 10 vouches within a single week\n• Eligibility resets every Sunday\n• Only regular vouches count towards eligibility",
                        inline: false
                    }
                ]);
            }
        }
        
        if (recentVouches.length > 0) {
            const regularVouches = recentVouches.filter(v => v.type === 'regular');
            const paidVouches = recentVouches.filter(v => v.type === 'paid');
            
            embed.addFields([
                {
                    name: "📅 This Week's Activity",
                    value: `**Regular Vouches:** ${regularVouches.length}\n**Paid Vouches:** ${paidVouches.length}\n**Total This Week:** ${recentVouches.length}`,
                    inline: true
                }
            ]);
        }
        
        if (helper.last_vouch_date) {
            const daysSinceLastVouch = Math.floor((Date.now() - helper.last_vouch_date) / (1000 * 60 * 60 * 24));
            embed.addFields([
                {
                    name: "⏰ Last Vouch",
                    value: daysSinceLastVouch === 0 ? "Today" : `${daysSinceLastVouch} day${daysSinceLastVouch !== 1 ? 's' : ''} ago`,
                    inline: true
                }
            ]);
        }
        
        embed.setFooter({ 
            text: "Paid helper eligibility resets every Sunday • Only regular vouches count towards eligibility" 
        });
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Error in helper-status command:', error);
        await interaction.editReply({ 
            content: "❌ Failed to retrieve helper status. Please try again later." 
        });
    } finally {
        await db.close();
    }
}

export default { data, execute };