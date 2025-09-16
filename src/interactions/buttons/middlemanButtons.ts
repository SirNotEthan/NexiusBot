import { ButtonInteraction } from 'discord.js';

export async function handleMiddlemanButtons(interaction: ButtonInteraction): Promise<void> {
    const { customId } = interaction;

    switch (customId) {
        default:
            await interaction.reply({
                content: "❌ Unknown middleman button interaction.",
                ephemeral: true
            });
            break;
    }
}