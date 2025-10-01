import {
    TextDisplayBuilder,
    SectionBuilder,
    SeparatorBuilder,
    ContainerBuilder,
    ButtonBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    ButtonStyle,
    MessageFlags,
    InteractionReplyOptions,
    MessageCreateOptions
} from 'discord.js';
// import { ModernComponentBuilder } from '../../../components/v2/builders/ComponentBuilder';

export interface RequestCarryData {
    type: 'regular' | 'paid';
    game?: string;
    gamemode?: string;
    goal?: string;
    canJoinLinks?: boolean;
    selectedHelper?: string;
    progress?: {
        current: number;
        total: number;
    };
}

/**
 * Modern Components V2 builder for request-carry command
 * Provides clean, structured UI with improved UX
 */
export class RequestCarryBuilder {
    private data: RequestCarryData;
    private userId: string;
    private useV2: boolean = true;

    constructor(data: RequestCarryData, userId: string, useComponentsV2: boolean = true) {
        this.data = data;
        this.userId = userId;
        this.useV2 = useComponentsV2;
    }

    /**
     * Build the complete request carry interface
     */
    build(): InteractionReplyOptions & MessageCreateOptions {
        if (this.useV2) {
            return this.buildV2();
        } else {
            return this.buildV1Fallback();
        }
    }

    /**
     * Build using Components V2
     */
    private buildV2(): InteractionReplyOptions & MessageCreateOptions {
        const components: any[] = [];

        // Professional header without emojis
        const typeLabel = this.data.type === 'paid' ? 'Paid' : 'Regular';
        const gameDisplay = this.data.game ? this.getGameDisplayName(this.data.game) : 'Game';
        
        const headerText = new TextDisplayBuilder()
            .setContent(`# Request ${typeLabel} Carry - ${gameDisplay}\n**Complete the form below to submit your carry request**`);
        components.push(headerText);
        components.push(new SeparatorBuilder());

        // Progress tracking section
        const progress = this.calculateProgress();
        const progressPercent = Math.round((progress.completed / progress.total) * 100);
        const progressBar = "█".repeat(Math.floor(progress.completed / progress.total * 10)) + 
                           "░".repeat(10 - Math.floor(progress.completed / progress.total * 10));
        
        const progressSection = new SectionBuilder();
        (progressSection as any).data = { content: `**Form Progress: ${progress.completed}/${progress.total} fields completed (${progressPercent}%)**\n\`${progressBar}\`` };
        components.push(progressSection);
        components.push(new SeparatorBuilder());

        // Main form container with all fields and controls
        const mainContainer = new ContainerBuilder();
        this.addFormFieldsAndControlsV2(mainContainer);
        components.push(mainContainer);

        return {
            components,
            flags: MessageFlags.IsComponentsV2
        };
    }

    /**
     * Add form fields and controls to the main container
     */
    private addFormFieldsAndControlsV2(container: ContainerBuilder): void {
        // Form fields section
        const fieldsContainer = new ContainerBuilder();
        
        // Game field
        const gameStatus = this.data.game ? 'SET' : 'REQUIRED';
        const gameDisplay = this.data.game ? this.getGameDisplayName(this.data.game) : 'Game will be pre-selected based on your command choice';
        const gameSection = new SectionBuilder();
        (gameSection as any).data = { content: `**Game** [${gameStatus}]\n${gameDisplay}` };
        fieldsContainer.components.push(gameSection);

        // Gamemode field - only show if game is selected
        if (this.data.game) {
            const gamemodeStatus = this.data.gamemode ? 'SET' : 'REQUIRED';
            const gamemodeDisplay = this.data.gamemode ? this.getGamemodeDisplayName(this.data.gamemode) : 'Select a gamemode from the dropdown below';
            const gamemodeSection = new SectionBuilder();
            (gamemodeSection as any).data = { content: `**Gamemode** [${gamemodeStatus}]\n${gamemodeDisplay}` };
            fieldsContainer.components.push(gamemodeSection);
        }

        // Goal field
        const goalStatus = this.data.goal ? 'SET' : 'REQUIRED';
        const goalDisplay = this.data.goal || 'Click "Set Goal" to describe what you need help with';
        const goalSection = new SectionBuilder();
        (goalSection as any).data = { content: `**Goal Description** [${goalStatus}]\n${goalDisplay}` };
        fieldsContainer.components.push(goalSection);

        // Links field
        const linksStatus = this.data.canJoinLinks !== undefined ? 'SET' : 'REQUIRED';
        const linksDisplay = this.data.canJoinLinks !== undefined 
            ? (this.data.canJoinLinks ? 'Yes - Can join Discord voice channels and links' : 'No - Cannot join Discord voice channels and links')
            : 'Select whether you can join Discord voice channels and links';
        const linksSection = new SectionBuilder();
        (linksSection as any).data = { content: `**Can Join Voice/Links** [${linksStatus}]\n${linksDisplay}` };
        fieldsContainer.components.push(linksSection);

        // Selected helper (for paid carries)
        if (this.data.type === 'paid') {
            const helperStatus = this.data.selectedHelper ? 'SET' : 'OPTIONAL';
            const helperDisplay = this.data.selectedHelper 
                ? `<@${this.data.selectedHelper}>`
                : 'Select a preferred helper (optional)';
            const helperSection = new SectionBuilder();
            (helperSection as any).data = { content: `**Preferred Helper** [${helperStatus}]\n${helperDisplay}` };
            fieldsContainer.components.push(helperSection);
        }

        container.components.push(...fieldsContainer.components);
        container.components.push(new SeparatorBuilder());

        // Controls container
        const controlsContainer = new ContainerBuilder();
        this.addControlsToContainer(controlsContainer);
        container.components.push(...controlsContainer.components);
    }

    /**
     * Add controls to a container
     */
    private addControlsToContainer(container: ContainerBuilder): void {
        // Game/Gamemode selection
        if (this.data.game) {
            const gamemodeSelect = this.createGamemodeSelect();
            if (gamemodeSelect) {
                const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gamemodeSelect);
                container.components.push(selectRow);
            }
        }

        // Action buttons row
        const actionButtons = this.createActionButtons();
        if (actionButtons.length > 0) {
            const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(actionButtons);
            container.components.push(actionRow);
        }

        // Secondary buttons row
        const secondaryButtons = this.createSecondaryButtons();
        if (secondaryButtons.length > 0) {
            const secondaryRow = new ActionRowBuilder<ButtonBuilder>().addComponents(secondaryButtons);
            container.components.push(secondaryRow);
        }
    }

    /**
     * Create interactive controls (legacy method for backwards compatibility)
     */
    private createControls(): ActionRowBuilder<any>[] {
        const controls: ActionRowBuilder<any>[] = [];

        // Game/Gamemode selection
        if (this.data.game) {
            const gamemodeSelect = this.createGamemodeSelect();
            if (gamemodeSelect) {
                controls.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gamemodeSelect));
            }
        }

        // Action buttons
        const actionButtons = this.createActionButtons();
        controls.push(new ActionRowBuilder<ButtonBuilder>().addComponents(actionButtons));

        // Secondary buttons
        const secondaryButtons = this.createSecondaryButtons();
        controls.push(new ActionRowBuilder<ButtonBuilder>().addComponents(secondaryButtons));

        return controls;
    }

    /**
     * Create gamemode selection dropdown
     */
    private createGamemodeSelect(): StringSelectMenuBuilder | null {
        if (!this.data.game) return null;

        const options = this.getGamemodeOptions(this.data.game);
        if (options.length === 0) return null;

        return new StringSelectMenuBuilder()
            .setCustomId(`request_carry_gamemode_${this.userId}`)
            .setPlaceholder('Choose the gamemode you need help with')
            .addOptions(options.map(option => 
                new StringSelectMenuOptionBuilder()
                    .setLabel(option.label)
                    .setValue(option.value)
                    .setDescription(option.description || `${option.label} gamemode`)
            ));
    }

    /**
     * Create primary action buttons
     */
    private createActionButtons(): ButtonBuilder[] {
        return [
            new ButtonBuilder()
                .setCustomId(`request_carry_goal_${this.userId}`)
                .setLabel('Set Goal')
                .setStyle(this.data.goal ? ButtonStyle.Success : ButtonStyle.Secondary),
            
            new ButtonBuilder()
                .setCustomId(`request_carry_links_yes_${this.userId}`)
                .setLabel('I can join links')
                .setStyle(this.data.canJoinLinks === true ? ButtonStyle.Success : ButtonStyle.Secondary),
            
            new ButtonBuilder()
                .setCustomId(`request_carry_links_no_${this.userId}`)
                .setLabel('Cannot Join Voice/Links')
                .setStyle(this.data.canJoinLinks === false ? ButtonStyle.Success : ButtonStyle.Secondary)
        ];
    }

    /**
     * Create secondary action buttons
     */
    private createSecondaryButtons(): ButtonBuilder[] {
        const isComplete = this.isFormComplete();
        
        return [
            new ButtonBuilder()
                .setCustomId(`request_carry_submit_${this.userId}`)
                .setLabel('Submit Request')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!isComplete),
            
            new ButtonBuilder()
                .setCustomId(`request_carry_cancel_${this.userId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
        ];
    }

    /**
     * V1 fallback for compatibility
     */
    private buildV1Fallback(): InteractionReplyOptions & MessageCreateOptions {
        // Implementation would use traditional embeds and action rows
        // This maintains backward compatibility while we transition to V2
        return {
            content: "V1 fallback not implemented yet",
            ephemeral: true
        };
    }

    /**
     * Helper methods
     */
    private createFieldContent(label: string, value: string | null): string {
        const status = value ? '✅' : '❌';
        const displayValue = value || '*Not set*';
        return `**${label}** ${status}\n${displayValue}`;
    }

    private calculateProgress(): { completed: number; total: number } {
        const fields = [this.data.game, this.data.gamemode, this.data.goal, this.data.canJoinLinks !== undefined];
        const completed = fields.filter(Boolean).length;
        return { completed, total: 4 };
    }

    private isFormComplete(): boolean {
        return !!(this.data.game && this.data.gamemode && this.data.goal && this.data.canJoinLinks !== undefined);
    }

    private getGameDisplayName(game: string): string {
        const gameNames: Record<string, string> = {
            'als': 'Anime Last Stand',
            'av': 'Anime Vanguards'
        };
        return gameNames[game] || game;
    }

    private getGameEmoji(game?: string): string {
        const gameEmojis: Record<string, string> = {
            'als': '⚔️',
            'av': '🔰'
        };
        return game ? gameEmojis[game] || '🎮' : '🎮';
    }

    private getGamemodeDisplayName(gamemode: string): string {
        const gamemodeNames: Record<string, string> = {
            'story': 'Story Mode',
            'legend-stages': 'Legend Stages',
            'rift': 'Rift Battles',
            'inf': 'Infinite Mode',
            'raids': 'Raid Battles',
            'sjw-dungeon': 'SJW Dungeon',
            'dungeons': 'Dungeons',
            'portals': 'Portal Challenges',
            'void': 'Void Content',
            'towers': 'Tower Challenges',
            'events': 'Limited Events',
            'survival': 'Survival Mode',
            'breach': 'Breach Missions'
        };
        return gamemodeNames[gamemode] || gamemode;
    }

    private getGamemodeOptions(game: string): { label: string; value: string; description?: string }[] {
        const gamemodes: Record<string, { label: string; value: string; description?: string }[]> = {
            'av': [
                { label: 'Story', value: 'story', description: 'Main story progression' },
                { label: 'Legend Stages', value: 'legend-stages', description: 'Challenge stages' },
                { label: 'Rift', value: 'rift', description: 'Rift battles' },
                { label: 'Inf', value: 'inf', description: 'Infinite mode' },
                { label: 'Raids', value: 'raids', description: 'Raid battles' },
                { label: 'SJW Dungeon', value: 'sjw-dungeon', description: 'Special dungeon' },
                { label: 'Dungeons', value: 'dungeons', description: 'Regular dungeons' },
                { label: 'Portals', value: 'portals', description: 'Portal challenges' },
                { label: 'Void', value: 'void', description: 'Void content' },
                { label: 'Towers', value: 'towers', description: 'Tower challenges' },
                { label: 'Events', value: 'events', description: 'Limited time events' }
            ],
            'als': [
                { label: 'Story', value: 'story', description: 'Main story progression' },
                { label: 'Legend Stages', value: 'legend-stages', description: 'Challenge stages' },
                { label: 'Raids', value: 'raids', description: 'Raid battles' },
                { label: 'Dungeons', value: 'dungeons', description: 'Dungeon runs' },
                { label: 'Survival', value: 'survival', description: 'Survival mode' },
                { label: 'Breach', value: 'breach', description: 'Breach missions' },
                { label: 'Portals', value: 'portals', description: 'Portal challenges' }
            ]
        };
        
        return gamemodes[game] || [];
    }
}

/**
 * Factory class for creating request carry builders
 */
export class RequestCarryBuilderFactory {
    static create(type: 'regular' | 'paid', userId: string, useV2 = true): RequestCarryBuilder {
        const data: RequestCarryData = { type };
        return new RequestCarryBuilder(data, userId, useV2);
    }

    static createWithData(data: RequestCarryData, userId: string, useV2 = true): RequestCarryBuilder {
        return new RequestCarryBuilder(data, userId, useV2);
    }
}