import { Client } from 'discord.js';
import Database from '../database/database';

export class DailyScheduler {
    private client: Client;
    private intervalId: NodeJS.Timeout | null = null;

    constructor(client: Client) {
        this.client = client;
    }

    start(): void {
        this.intervalId = setInterval(async () => {
            await this.checkDailyReset();
        }, 60 * 60 * 1000);

        console.log('✅ Daily scheduler started');
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log('✅ Daily scheduler stopped');
    }

    private async checkDailyReset(): Promise<void> {
        const now = new Date();
        const hour = now.getUTCHours();
        const minute = now.getUTCMinutes();

        if (hour === 0 && minute < 60) {
            await this.performDailyReset();
        }
    }

    private async performDailyReset(): Promise<void> {
        console.log('🔄 Starting daily reset...');

        const db = new Database();

        try {
            await db.connect();

            await db.resetDailyStats();

            console.log('✅ Daily reset completed successfully');

            await this.logDailyReset();

        } catch (error) {
            console.error('❌ Error during daily reset:', error);
        } finally {
            await db.close();
        }
    }

    private async logDailyReset(): Promise<void> {
        try {
            const logChannelId = process.env.DAILY_RESET_LOG_CHANNEL_ID;
            if (!logChannelId) return;

            const channel = await this.client.channels.fetch(logChannelId);
            if (!channel || !channel.isTextBased() || !('send' in channel)) return;

            const resetMessage = `🔄 **Daily Reset Completed**\n\n` +
                `• Message counts reset to 0\n` +
                `• Free carry usage limits reset\n` +
                `• Time: <t:${Math.floor(Date.now() / 1000)}:F>`;

            await channel.send(resetMessage);

        } catch (error) {
            console.error('Error logging daily reset:', error);
        }
    }

    async forceDailyReset(): Promise<void> {
        await this.performDailyReset();
    }
}

export default DailyScheduler;
