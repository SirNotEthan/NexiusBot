import { ButtonInteraction } from 'discord.js';
import { refreshTrackerBoard } from '../../commands/vouch/tracker';

export async function handleTrackerRefreshButton(interaction: ButtonInteraction): Promise<void> {
    await refreshTrackerBoard(interaction);
}