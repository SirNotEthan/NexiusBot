import { Events, Message } from 'discord.js';
import Database from '../database/database';

export const name = Events.MessageCreate;
export const once = false;

export async function execute(message: Message): Promise<void> {
    if (message.author.bot || !message.guild) return;
    
    // Only respond in the designated chat channel
    if (message.channel.id !== process.env.CHAT_CHANNEL_ID) return;
    
    const YOUR_USER_ID = process.env.YOUR_USER_ID 
    if (message.mentions.users.has(message.client.user?.id || '') && 
        message.content.toLowerCase().includes('hi')) {
        await message.reply('hi');
        return;
    }

    if (message.author.id === YOUR_USER_ID && 
        message.mentions.users.has(message.client.user?.id || '') && 
        message.content.toLowerCase().includes('am i cool?')) {
        await message.reply('yes');
        return;
    }

    if (message.author.id === YOUR_USER_ID && 
        message.mentions.users.has(message.client.user?.id || '') && 
        message.content.toLowerCase().includes('what are you?')) {
        await message.reply('an idiot sandwich..');
        await message.reply('jk im your owner');
        return;
    }

    if (message.mentions.users.has(message.client.user?.id || '') && 
        message.content.toLowerCase().includes('love you pookie')) {
        await message.reply('love you too <3');
        return;
    }

    if (message.mentions.users.has(message.client.user?.id || '') && 
        message.content.toLowerCase().includes('fuck you')) {
        await message.reply('fuck you too');
        return;
    }
    
    const db = new Database();
    
    try {
        await db.connect();
        await db.incrementUserMessages(message.author.id, message.author.tag);
    } catch (error) {
        console.error('Error tracking user message:', error);
    } finally {
        await db.close();
    }
}