import { Events, Client, ActivityType } from 'discord.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: Client<true>) {
    console.log(`✅ Ready! Logged in as ${client.user?.tag}`);
    console.log(`📊 Serving ${client.guilds.cache.size} servers`);
    console.log(`👥 Serving ${client.users.cache.size} users`);
    
    client.user?.setActivity('Monitoring the Vouches', { type: ActivityType.Custom });
}