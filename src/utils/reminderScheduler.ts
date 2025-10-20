import { Client, TextChannel } from 'discord.js';

export class ReminderScheduler {
    private client: Client;
    private intervalId: NodeJS.Timeout | null = null;

    constructor(client: Client) {
        this.client = client;
    }

    start(): void {
        this.intervalId = setInterval(async () => {
            await this.sendReminder();
        }, 2 * 60 * 60 * 1000);

        console.log('✅ Reminder scheduler started (runs every 2 hours)');

        this.sendReminder();
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log('✅ Reminder scheduler stopped');
    }

    private async sendReminder(): Promise<void> {
        try {
            const reminderChannelId = process.env.REMINDER_CHANNEL_ID;
            const reminderRoleId = process.env.REMINDER_ROLE_ID;
            const reminderMessage = process.env.REMINDER_MESSAGE || 'Reminder: Please check for pending tasks!';

            if (!reminderChannelId) {
                console.warn('⚠️ REMINDER_CHANNEL_ID not configured in .env');
                return;
            }

            if (!reminderRoleId) {
                console.warn('⚠️ REMINDER_ROLE_ID not configured in .env');
                return;
            }

            const channel = await this.client.channels.fetch(reminderChannelId);

            if (!channel || !channel.isTextBased()) {
                console.error('❌ Reminder channel not found or is not a text channel');
                return;
            }

            const textChannel = channel as TextChannel;

            await textChannel.send({
                content: `<@&${reminderRoleId}> ${reminderMessage}`
            });

            console.log(`✅ Reminder sent to channel ${reminderChannelId}`);

        } catch (error) {
            console.error('❌ Error sending reminder:', error);
        }
    }

    async forceSendReminder(): Promise<void> {
        await this.sendReminder();
    }
}

export default ReminderScheduler;
