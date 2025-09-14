import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Database from '../../database/database';
import { FREE_CARRIES_CONFIG } from '../../config/freeCarriesConfig';

const data = new SlashCommandBuilder()
    .setName("carry-status")
    .setDescription("Check your current free carry usage and remaining limits");

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    
    const db = new Database();
    await db.connect();
    
    try {
        const userId = interaction.user.id;
        const messageStats = await db.getUserMessageStats(userId);
        const usageRecords = await db.getUserFreeCarryUsageByDate(userId);
        
        const embed = new EmbedBuilder()
            .setTitle("🎫 Your Free Carry Status")
            .setColor(0x5865f2)
            .setTimestamp();
        
        const messageCount = messageStats?.message_count || 0;
        const messageRequirement = messageCount >= 50 ? "✅" : "❌";
        embed.addFields([
            {
                name: "📝 Message Activity Today",
                value: `${messageRequirement} ${messageCount}/50 messages (${messageCount >= 50 ? 'Eligible' : 'Need more messages'})`,
                inline: false
            }
        ]);
        
        for (const [gameCode, gameConfig] of Object.entries(FREE_CARRIES_CONFIG)) {
            const gameUsage = usageRecords.filter(record => record.game === gameCode);
            
            let gameStatus = `**${gameConfig.displayName}**\n`;
            let hasUsage = false;
            
            for (const [gamemode, limit] of Object.entries(gameConfig.gameLimits)) {
                const usageRecord = gameUsage.find(record => record.gamemode === gamemode);
                const used = usageRecord?.usage_count || 0;
                const remaining = limit - used;
                const status = remaining > 0 ? "🟢" : "🔴";
                
                gameStatus += `${status} **${gamemode}**: ${used}/${limit} used\n`;
                
                if (used > 0) hasUsage = true;
            }
            
            if (hasUsage || messageCount >= 50) {
                embed.addFields([
                    {
                        name: `🎲 ${gameConfig.displayName}`,
                        value: gameStatus,
                        inline: true
                    }
                ]);
            }
        }
        
        if (messageCount < 50) {
            embed.setDescription("❌ **You need at least 50 messages today to use free carries.**\n\nStart chatting in the server to unlock free carry requests!");
        } else if (usageRecords.length === 0) {
            embed.setDescription("✅ **You're eligible for free carries!**\n\nUse `/request-carry` to create your first request today.");
        } else {
            embed.setDescription("✅ **You're eligible for free carries!**\n\nCheck your limits above and use `/request-carry` to create requests.");
        }
        
        embed.setFooter({ text: "Limits reset daily at midnight UTC • 🟢 Available • 🔴 Limit reached" });
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Error in carry-status command:', error);
        await interaction.editReply({ 
            content: "❌ Failed to retrieve carry status. Please try again later." 
        });
    } finally {
        await db.close();
    }
}

export default { data, execute };