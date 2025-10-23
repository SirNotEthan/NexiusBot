import { Client } from 'discord.js';
import Database from '../database/database';

export class WeeklyScheduler {
    private client: Client;
    private intervalId: NodeJS.Timeout | null = null;

    constructor(client: Client) {
        this.client = client;
    }

    start(): void {
        this.intervalId = setInterval(async () => {
            await this.checkWeeklyReset();
        }, 60 * 60 * 1000);

        console.log('✅ Weekly scheduler started');
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log('✅ Weekly scheduler stopped');
    }

    private async checkWeeklyReset(): Promise<void> {
        const now = new Date();
        const dayOfWeek = now.getUTCDay();
        const hour = now.getUTCHours();

        if (dayOfWeek === 0 && hour === 0) {
            await this.performWeeklyReset();
        }
    }

    private async performWeeklyReset(): Promise<void> {
        console.log('🔄 Starting weekly reset...');
        
        const db = new Database();
        await db.connect();

        try {
            const helpersForDemotion = await db.getHelpersForDemotion();
            
            for (const helper of helpersForDemotion) {
                await this.notifyDemotion(helper);
            }

            await db.resetWeeklyStats();

            await this.removeExpiredPaidHelperBios();

            console.log(`✅ Weekly reset completed. ${helpersForDemotion.length} helpers were below the weekly requirement.`);

        } catch (error) {
            console.error('❌ Error during weekly reset:', error);
        } finally {
            await db.close();
        }
    }

    private async notifyDemotion(helper: any): Promise<void> {
        try {
            const demotionChannelId = process.env.DEMOTION_CHANNEL_ID;
            if (!demotionChannelId) return;

            const channel = await this.client.channels.fetch(demotionChannelId);
            if (!channel || !channel.isTextBased() || !('send' in channel)) return;

            const warningMessage = `⚠️ **Weekly Voucher Requirement Not Met**\n\n` +
                `<@${helper.user_id}> (${helper.user_tag}) only received **${helper.weekly_vouches}/10** vouches this week.\n\n` +
                `Please ensure you meet the weekly requirement to maintain your helper status.`;

            await channel.send(warningMessage);

        } catch (error) {
            console.error(`Error notifying demotion for ${helper.user_tag}:`, error);
        }
    }

    private async removeExpiredPaidHelperBios(): Promise<void> {
        
        console.log('ℹ️ Bio cleanup skipped (feature removed)');
    }

    async forceWeeklyReset(): Promise<void> {
        await this.performWeeklyReset();
    }
}

export default WeeklyScheduler;