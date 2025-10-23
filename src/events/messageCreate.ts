import { Events, Message } from 'discord.js';
import Database from '../database/database';

export const name = Events.MessageCreate;
export const once = false;

export async function execute(message: Message): Promise<void> {
    if (message.author.bot || !message.guild) return;
    
    const ticketCategoryIds = [
        process.env.TICKETS_CATEGORY_ID,
        process.env.PAID_TICKETS_CATEGORY_ID,
        process.env.ALS_REGULAR_CATEGORY_ID,
        process.env.ALS_PAID_CATEGORY_ID,
        process.env.AV_REGULAR_CATEGORY_ID,
        process.env.AV_PAID_CATEGORY_ID
    ].filter(Boolean);
    
    const channel = message.channel;
    const isTicketChannel = channel.type === 0 && ticketCategoryIds.includes(channel.parentId || '');
    
    // Track user messages from all channels except ticket channels
    const isInChatChannel = message.channel.id === process.env.CHAT_CHANNEL_ID;
    
    if (!isInChatChannel) {
        // Track the message but don't respond to mentions (unless it's a ticket channel)
        if (!isTicketChannel) {
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
        return;
    }
    
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
    
    if (!isTicketChannel) {
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
}