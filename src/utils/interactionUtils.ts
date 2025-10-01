import { 
    BaseInteraction, 
    ChatInputCommandInteraction, 
    ButtonInteraction, 
    ModalSubmitInteraction,
    StringSelectMenuInteraction,
    InteractionReplyOptions,
    InteractionEditReplyOptions,
    InteractionUpdateOptions
} from 'discord.js';
import { botLogger } from './logger';

export type SafeInteraction = ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction;

function getCustomId(interaction: SafeInteraction): string {
    if ('customId' in interaction) {
        return interaction.customId;
    }
    if ('commandName' in interaction) {
        return interaction.commandName;
    }
    return 'unknown';
}

function getInteractionTypeName(interaction: SafeInteraction): string {
    if (interaction.isButton()) return 'Button';
    if (interaction.isStringSelectMenu()) return 'SelectMenu';
    if (interaction.isModalSubmit()) return 'Modal';
    if (interaction.isChatInputCommand()) return 'Command';
    return 'Unknown';
}

export async function safeReply(interaction: SafeInteraction, options: InteractionReplyOptions): Promise<boolean> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || undefined;
    const channelId = interaction.channelId;
    const typeName = getInteractionTypeName(interaction);
    const customId = getCustomId(interaction);
    
    try {
        if (!interaction.isRepliable()) {
            await botLogger.logInteractionValidation(
                typeName,
                customId,
                userId,
                'Interaction is not repliable',
                guildId,
                channelId
            );
            return false;
        }

        const now = Date.now();
        const interactionAge = now - interaction.createdTimestamp;
        
        if (interactionAge > 14 * 60 * 1000) {
            await botLogger.logInteractionTimeout(
                typeName,
                customId,
                userId,
                interactionAge,
                guildId,
                channelId
            );
            return false;
        }

        if (interaction.replied || interaction.deferred) {
            await botLogger.logInteractionValidation(
                typeName,
                customId,
                userId,
                'Interaction already replied or deferred',
                guildId,
                channelId
            );
            return false;
        }

        await interaction.reply(options);
        return true;
    } catch (error: any) {
        await botLogger.logInteractionFailure(
            typeName,
            customId,
            userId,
            error,
            guildId,
            channelId,
            'Safe reply operation failed'
        );
        return false;
    }
}

export async function safeEditReply(interaction: SafeInteraction, options: InteractionEditReplyOptions): Promise<boolean> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || undefined;
    const channelId = interaction.channelId;
    const typeName = getInteractionTypeName(interaction);
    const customId = getCustomId(interaction);
    
    try {
        if (!interaction.isRepliable()) {
            await botLogger.logInteractionValidation(
                typeName,
                customId,
                userId,
                'Interaction is not repliable',
                guildId,
                channelId
            );
            return false;
        }

        const now = Date.now();
        const interactionAge = now - interaction.createdTimestamp;
        
        if (interactionAge > 14 * 60 * 1000) {
            await botLogger.logInteractionTimeout(
                typeName,
                customId,
                userId,
                interactionAge,
                guildId,
                channelId
            );
            return false;
        }

        if (!interaction.replied && !interaction.deferred) {
            await botLogger.logInteractionValidation(
                typeName,
                customId,
                userId,
                'Interaction not replied or deferred, cannot edit',
                guildId,
                channelId
            );
            return false;
        }

        await interaction.editReply(options);
        return true;
    } catch (error: any) {
        await botLogger.logInteractionFailure(
            typeName,
            customId,
            userId,
            error,
            guildId,
            channelId,
            'Safe edit reply operation failed'
        );
        return false;
    }
}

export async function safeDeferReply(interaction: SafeInteraction, options?: { ephemeral?: boolean }): Promise<boolean> {
    try {
        if (!interaction.isRepliable()) {
            console.warn('Interaction is not repliable');
            return false;
        }

        const now = Date.now();
        const interactionAge = now - interaction.createdTimestamp;
        
        if (interactionAge > 14 * 60 * 1000) {
            console.warn('Interaction is too old (>14 minutes), skipping defer');
            return false;
        }

        if (interaction.replied || interaction.deferred) {
            console.warn('Interaction already replied or deferred');
            return false;
        }

        await interaction.deferReply(options);
        return true;
    } catch (error: any) {
        if (error.code === 10062) {
            console.warn('Interaction expired (10062), skipping defer');
            return false;
        }
        console.error('Error in safeDeferReply:', error);
        return false;
    }
}

export async function safeDeferUpdate(interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<boolean> {
    try {
        const now = Date.now();
        const interactionAge = now - interaction.createdTimestamp;
        
        if (interactionAge > 14 * 60 * 1000) {
            console.warn('Interaction is too old (>14 minutes), skipping defer update');
            return false;
        }

        if (interaction.replied || interaction.deferred) {
            console.warn('Interaction already replied or deferred');
            return false;
        }

        await interaction.deferUpdate();
        return true;
    } catch (error: any) {
        if (error.code === 10062) {
            console.warn('Interaction expired (10062), skipping defer update');
            return false;
        }
        console.error('Error in safeDeferUpdate:', error);
        return false;
    }
}

export async function safeFollowUp(interaction: SafeInteraction, options: InteractionReplyOptions): Promise<boolean> {
    try {
        if (!interaction.isRepliable()) {
            console.warn('Interaction is not repliable');
            return false;
        }

        const now = Date.now();
        const interactionAge = now - interaction.createdTimestamp;
        
        if (interactionAge > 14 * 60 * 1000) {
            console.warn('Interaction is too old (>14 minutes), skipping follow up');
            return false;
        }

        if (!interaction.replied && !interaction.deferred) {
            console.warn('Interaction not replied or deferred, cannot follow up');
            return false;
        }

        await interaction.followUp(options);
        return true;
    } catch (error: any) {
        if (error.code === 10062) {
            console.warn('Interaction expired (10062), skipping follow up');
            return false;
        }
        console.error('Error in safeFollowUp:', error);
        return false;
    }
}

export async function safeUpdate(interaction: ButtonInteraction | StringSelectMenuInteraction, options: InteractionUpdateOptions): Promise<boolean> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || undefined;
    const channelId = interaction.channelId;
    const typeName = getInteractionTypeName(interaction);
    const customId = getCustomId(interaction);
    
    try {
        const now = Date.now();
        const interactionAge = now - interaction.createdTimestamp;
        
        if (interactionAge > 14 * 60 * 1000) {
            await botLogger.logInteractionTimeout(
                typeName,
                customId,
                userId,
                interactionAge,
                guildId,
                channelId
            );
            return false;
        }

        if (interaction.replied) {
            await botLogger.logInteractionValidation(
                typeName,
                customId,
                userId,
                'Interaction already replied, cannot update',
                guildId,
                channelId
            );
            return false;
        }

        await interaction.update(options);
        return true;
    } catch (error: any) {
        await botLogger.logInteractionFailure(
            typeName,
            customId,
            userId,
            error,
            guildId,
            channelId,
            'Safe update operation failed'
        );
        return false;
    }
}

export function isInteractionValid(interaction: BaseInteraction): boolean {
    const now = Date.now();
    const interactionAge = now - interaction.createdTimestamp;
    
    return interactionAge <= 14 * 60 * 1000;
}