import { ButtonInteraction } from 'discord.js';
import { updateLeaderboard } from '../../commands/vouch/leaderboard';

export async function handleLeaderboardButtons(interaction: ButtonInteraction): Promise<void> {
    const parts = interaction.customId.split('_');
    const type = parts[1] as 'regular' | 'paid';
    const timeframe = parts[2] as 'weekly' | 'monthly' | 'overall';
    const userId = parts[3];
    
    if (interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ This button is not for you!", ephemeral: true });
        return;
    }

    await interaction.deferUpdate();
    await updateLeaderboard(interaction, type, timeframe);
}