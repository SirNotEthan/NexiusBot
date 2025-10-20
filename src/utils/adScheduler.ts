import { Client, TextChannel, ContainerBuilder, TextDisplayBuilder, MessageFlags } from 'discord.js';

export class AdScheduler {
    private client: Client;
    private intervalId: NodeJS.Timeout | null = null;
    private readonly AD_CHANNEL_ID = '1429472351292096675';
    private readonly AD_ROLE_ID = '1429199010274607165';
    private readonly AD_LINK = 'https://discord.com/channels/1088674015259938830/1294703115819417630';

    constructor(client: Client) {
        this.client = client;
    }

    start(): void {
        // Run every 3 hours (3 * 60 * 60 * 1000 milliseconds)
        this.intervalId = setInterval(async () => {
            await this.sendAdvertisement();
        }, 3 * 60 * 60 * 1000);

        console.log('✅ Advertisement scheduler started (runs every 3 hours)');

        // Send the first advertisement immediately when the bot starts
        this.sendAdvertisement();
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log('✅ Advertisement scheduler stopped');
    }

    private async sendAdvertisement(): Promise<void> {
        try {
            const channel = await this.client.channels.fetch(this.AD_CHANNEL_ID);

            if (!channel || !channel.isTextBased()) {
                console.error('❌ Advertisement channel not found or is not a text channel');
                return;
            }

            const textChannel = channel as TextChannel;

            // Create a container message
            const container = new ContainerBuilder();
            if (!(container as any).components) {
                (container as any).components = [];
            }

            // Add the text display to the container
            const textDisplay = new TextDisplayBuilder()
                .setContent(`<@&${this.AD_ROLE_ID}> \n\nIt is time to post the advertisement message in ${this.AD_LINK}`);

            (container as any).components.push(textDisplay);

            await textChannel.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });

            console.log(`✅ Advertisement reminder sent to channel ${this.AD_CHANNEL_ID} at ${new Date().toISOString()}`);

        } catch (error) {
            console.error('❌ Error sending advertisement reminder:', error);
        }
    }

    async forceSendAdvertisement(): Promise<void> {
        await this.sendAdvertisement();
    }
}

export default AdScheduler;
