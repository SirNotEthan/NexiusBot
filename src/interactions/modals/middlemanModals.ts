import { ModalSubmitInteraction } from 'discord.js';

export async function handleMiddlemanModals(interaction: ModalSubmitInteraction): Promise<void> {
    switch (interaction.customId) {
        default:
            await interaction.reply({
                content: "❌ Unknown middleman modal interaction.",
                ephemeral: true
            });
            break;
    }
}