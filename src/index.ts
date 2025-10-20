import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { initializeDatabase, closeDatabase } from './database';
import WeeklyScheduler from './utils/scheduler';
import DailyScheduler from './utils/dailyScheduler';
import ReminderScheduler from './utils/reminderScheduler';
import { botLogger } from './utils/logger';

dotenv.config();

declare module 'discord.js' {
    export interface Client {
        commands: Collection<string, any>;
        buttons: Collection<string, any>;
        modals: Collection<string, any>;
        selectMenus: Collection<string, any>;
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();
client.buttons = new Collection();
client.modals = new Collection();
client.selectMenus = new Collection();

let weeklyScheduler: WeeklyScheduler;
let dailyScheduler: DailyScheduler;
let reminderScheduler: ReminderScheduler;

async function loadCommands(): Promise<void> {
    client.commands.clear();
    const commandsPath = path.join(__dirname, 'commands');
    
    function loadCommandsFromDirectory(dir: string): void {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const itemPath = path.join(dir, item);
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory()) {
                loadCommandsFromDirectory(itemPath);
            } else if (item.endsWith('.js') || item.endsWith('.ts')) {
                try {
                    delete require.cache[require.resolve(itemPath)];
                    const command = require(itemPath);
                    const commandData = command.default || command;
                    
                    if ('data' in commandData && 'execute' in commandData) {
                        client.commands.set(commandData.data.name, commandData);
                        console.log(`✅ Loaded command: ${commandData.data.name}`);
                    } else {
                        console.log(`⚠️ The command at ${itemPath} is missing a required "data" or "execute" property.`);
                    }
                } catch (error) {
                    console.error(`❌ Error loading command at ${itemPath}:`, error);
                }
            }
        }
    }
    
    if (fs.existsSync(commandsPath)) {
        loadCommandsFromDirectory(commandsPath);
    } else {
        console.log(`⚠️ Commands directory not found: ${commandsPath}`);
    }
}

async function loadEvents(): Promise<void> {
    const eventsPath = path.join(__dirname, 'events');
    
    if (!fs.existsSync(eventsPath)) {
        console.log(`⚠️ Events directory not found: ${eventsPath}`);
        return;
    }

    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        
        try {
            delete require.cache[require.resolve(filePath)];
            const event = require(filePath);
            
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args));
            } else {
                client.on(event.name, (...args) => event.execute(...args));
            }
            
            console.log(`✅ Loaded event: ${event.name}`);
        } catch (error) {
            console.error(`❌ Error loading event at ${filePath}:`, error);
        }
    }
}

async function loadInteractions(): Promise<void> {
    console.log('📝 Interaction handlers ready for buttons, modals, and select menus');
}

async function deployCommands(): Promise<void> {
    const commands = [];
    
    for (const command of client.commands.values()) {
        commands.push(command.data.toJSON());
    }

    if (commands.length === 0) {
        console.log('⚠️ No commands to deploy');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN!);

    try {
        console.log(`🚀 Started refreshing ${commands.length} application (/) commands.`);

        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID!),
            { body: commands },
        ) as any;

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
        throw error;
    }
}

async function initializeBot(): Promise<void> {
    try {
        console.log('🤖 Initializing VouchBot...');
        
        await initializeDatabase();
        await loadCommands();
        await loadEvents();
        await loadInteractions();
        await deployCommands();
        
        await client.login(process.env.BOT_TOKEN);

        botLogger.initialize(client);

        // Initialize schedulers
        weeklyScheduler = new WeeklyScheduler(client);
        weeklyScheduler.start();

        dailyScheduler = new DailyScheduler(client);
        dailyScheduler.start();

        reminderScheduler = new ReminderScheduler(client);
        reminderScheduler.start();

        console.log('🚀 VouchBot initialization complete!');
        await botLogger.logBotStart();
    } catch (error) {
        console.error('❌ Failed to initialize bot:', error);
        process.exit(1);
    }
}

process.on('SIGINT', async () => {
    console.log('\n🔄 Received SIGINT, shutting down gracefully...');
    await botLogger.logBotShutdown();
    if (weeklyScheduler) weeklyScheduler.stop();
    if (dailyScheduler) dailyScheduler.stop();
    if (reminderScheduler) reminderScheduler.stop();
    await closeDatabase();
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🔄 Received SIGTERM, shutting down gracefully...');
    await botLogger.logBotShutdown();
    if (weeklyScheduler) weeklyScheduler.stop();
    if (dailyScheduler) dailyScheduler.stop();
    if (reminderScheduler) reminderScheduler.stop();
    await closeDatabase();
    client.destroy();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    botLogger.error('Uncaught Exception', 'A critical error occurred that was not handled by the application', error);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error);
    botLogger.error('Unhandled Promise Rejection', 'A promise was rejected but no catch handler was provided', error as Error);
    process.exit(1);
});

initializeBot();

export { client };