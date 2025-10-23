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

export class RequestCarryBuilder {
    private data: RequestCarryData;
    private userId: string;
    private useV2: boolean = true;

    constructor(data: RequestCarryData, userId: string, useComponentsV2: boolean = true) {
        this.data = data;
        this.userId = userId;
        this.useV2 = useComponentsV2;
    }

    build(): InteractionReplyOptions & MessageCreateOptions {
        if (this.useV2) {
            return this.buildV2();
        } else {
            return this.buildV1Fallback();
        }
    }

    private buildV2(): InteractionReplyOptions & MessageCreateOptions {
        const components: any[] = [];

        const typeLabel = this.data.type === 'paid' ? 'Paid' : 'Regular';
        const gameDisplay = this.data.game ? this.getGameDisplayName(this.data.game) : 'Game';

        const headerText = new TextDisplayBuilder()
            .setContent(`# Request ${typeLabel} Carry - ${gameDisplay}\n**Complete the form below to submit your carry request**`);
        components.push(headerText);
        components.push(new SeparatorBuilder());

        const progress = this.calculateProgress();
        const progressPercent = Math.round((progress.completed / progress.total) * 100);
        const progressBar = "█".repeat(Math.floor(progress.completed / progress.total * 10)) +
                           "░".repeat(10 - Math.floor(progress.completed / progress.total * 10));

        const progressText = new TextDisplayBuilder()
            .setContent(`**Form Progress: ${progress.completed}/${progress.total} fields completed (${progressPercent}%)**\n\`${progressBar}\``);
        components.push(progressText);
        components.push(new SeparatorBuilder());

        const mainContainer = new ContainerBuilder();
        if (!(mainContainer as any).components) {
            (mainContainer as any).components = [];
        }
        this.addFormFieldsV2(mainContainer);
        components.push(mainContainer);

        this.addInteractiveControlsV2(components);

        return {
            components,
            flags: MessageFlags.IsComponentsV2
        };
    }

    private addFormFieldsV2(container: ContainerBuilder): void {
        
        if (!(container as any).components) {
            (container as any).components = [];
        }

        const fieldsContainer = new ContainerBuilder();
        if (!(fieldsContainer as any).components) {
            (fieldsContainer as any).components = [];
        }
        
        const gameStatus = this.data.game ? 'SET' : 'REQUIRED';
        const gameDisplay = this.data.game ? this.getGameDisplayName(this.data.game) : 'Game will be pre-selected based on your command choice';
        const gameText = new TextDisplayBuilder()
            .setContent(`**Game** [${gameStatus}]\n${gameDisplay}`);
        fieldsContainer.components.push(gameText);

        if (this.data.game) {
            const gamemodeStatus = this.data.gamemode ? 'SET' : 'REQUIRED';
            const gamemodeDisplay = this.data.gamemode ? this.getGamemodeDisplayName(this.data.gamemode) : 'Select a gamemode from the dropdown below';
            const gamemodeText = new TextDisplayBuilder()
                .setContent(`**Gamemode** [${gamemodeStatus}]\n${gamemodeDisplay}`);
            fieldsContainer.components.push(gamemodeText);
        }

        const goalStatus = this.data.goal ? 'SET' : 'REQUIRED';
        const goalDisplay = this.data.goal || 'Click "Set Goal" to describe what you need help with';
        const goalText = new TextDisplayBuilder()
            .setContent(`**Goal Description** [${goalStatus}]\n${goalDisplay}`);
        fieldsContainer.components.push(goalText);

        const linksStatus = this.data.canJoinLinks !== undefined ? 'SET' : 'REQUIRED';
        const linksDisplay = this.data.canJoinLinks !== undefined
            ? (this.data.canJoinLinks ? 'Yes - Can join Discord voice channels and links' : 'No - Cannot join Discord voice channels and links')
            : 'Select whether you can join Discord voice channels and links';
        const linksText = new TextDisplayBuilder()
            .setContent(`**Can Join Voice/Links** [${linksStatus}]\n${linksDisplay}`);
        fieldsContainer.components.push(linksText);

        if (this.data.type === 'paid') {
            const helperStatus = this.data.selectedHelper ? 'SET' : 'OPTIONAL';
            const helperDisplay = this.data.selectedHelper
                ? `<@${this.data.selectedHelper}>`
                : 'Select a preferred helper (optional)';
            const helperText = new TextDisplayBuilder()
                .setContent(`**Preferred Helper** [${helperStatus}]\n${helperDisplay}`);
            fieldsContainer.components.push(helperText);
        }

        if (fieldsContainer.components && fieldsContainer.components.length > 0) {
            container.components.push(...fieldsContainer.components);
        }
    }

    private addInteractiveControlsV2(components: any[]): void {
        
        if (this.data.game) {
            const gamemodeSelect = this.createGamemodeSelect();
            if (gamemodeSelect) {
                const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gamemodeSelect);
                components.push(selectRow);
            }
        }

        const actionButtons = this.createActionButtons();
        if (actionButtons.length > 0) {
            const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(actionButtons);
            components.push(actionRow);
        }

        const secondaryButtons = this.createSecondaryButtons();
        if (secondaryButtons.length > 0) {
            const secondaryRow = new ActionRowBuilder<ButtonBuilder>().addComponents(secondaryButtons);
            components.push(secondaryRow);
        }
    }

    private addControlsToContainer(container: ContainerBuilder): void {
        
        if (!(container as any).components) {
            (container as any).components = [];
        }

    }

    private createControls(): ActionRowBuilder<any>[] {
        const controls: ActionRowBuilder<any>[] = [];

        if (this.data.game) {
            const gamemodeSelect = this.createGamemodeSelect();
            if (gamemodeSelect) {
                controls.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gamemodeSelect));
            }
        }

        const actionButtons = this.createActionButtons();
        controls.push(new ActionRowBuilder<ButtonBuilder>().addComponents(actionButtons));

        const secondaryButtons = this.createSecondaryButtons();
        controls.push(new ActionRowBuilder<ButtonBuilder>().addComponents(secondaryButtons));

        return controls;
    }

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

    private buildV1Fallback(): InteractionReplyOptions & MessageCreateOptions {
        
        return {
            content: "V1 fallback not implemented yet",
            ephemeral: true
        };
    }

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
            'av': 'Anime Vanguards',
            'ac': 'Anime Crusaders'
        };
        return gameNames[game] || game;
    }

    private getGameEmoji(game?: string): string {
        const gameEmojis: Record<string, string> = {
            'als': '⚔️',
            'av': '🔰',
            'ac': '⚡'
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
            'breach': 'Breach Missions',
            'spirit-invasion': 'Spirit Invasion'
        };
        return gamemodeNames[gamemode] || gamemode;
    }

    private getGamemodeOptions(game: string): { label: string; value: string; description?: string }[] {
        const gamemodes: Record<string, { label: string; value: string; description?: string }[]> = {
            'av': [
                { label: '📖 Story', value: 'story', description: 'Main story progression' },
                { label: '👑 Infinite', value: 'inf', description: 'Infinite mode' },
                { label: '🏆 Challenges', value: 'towers', description: 'Challenge content' },
                { label: '🌟 Legend', value: 'legend-stages', description: 'Legend stages' },
                { label: '🔥 Raid dungeons', value: 'dungeons', description: 'Raid dungeons' },
                { label: '🌀 Portal', value: 'portals', description: 'Portal challenges' },
                { label: '🐉 Boss Raids', value: 'raids', description: 'Boss Raids' },
                { label: '🌠 Rifts', value: 'rift', description: 'Rift battles' }
            ],
            'als': [
                { label: '📚 Story', value: 'story', description: 'Main story progression' },
                { label: '♾️ Infinite', value: 'inf', description: 'Infinite mode' },
                { label: '⚔️ Raids', value: 'raids', description: 'Raid battles' },
                { label: '🏆 Challenges', value: 'towers', description: 'Challenge content' },
                { label: '🎤 Portals', value: 'portals', description: 'Portal challenges' },
                { label: '🪨 Cavens', value: 'breach', description: 'Cavens missions' },
                { label: '👑 Legend Stages', value: 'legend-stages', description: 'Legend stages' },
                { label: '💀 Dungeons', value: 'dungeons', description: 'Dungeon runs' },
                { label: '🩹 Survival', value: 'survival', description: 'Survival mode' }
            ],
            'ac': [
                { label: '👻 Spirit Invasion', value: 'spirit-invasion', description: 'Spirit Invasion mode' },
                { label: '⚔️ Raids', value: 'raids', description: 'Raid battles' },
                { label: '📖 Story', value: 'story', description: 'Main story progression' },
                { label: '🌀 Portals', value: 'portals', description: 'Portal challenges' },
                { label: '👑 Legend Stages', value: 'legend-stages', description: 'Legend stages' }
            ]
        };

        return gamemodes[game] || [];
    }
}

export class RequestCarryBuilderFactory {
    static create(type: 'regular' | 'paid', userId: string, useV2 = true): RequestCarryBuilder {
        const data: RequestCarryData = { type };
        return new RequestCarryBuilder(data, userId, useV2);
    }

    static createWithData(data: RequestCarryData, userId: string, useV2 = true): RequestCarryBuilder {
        return new RequestCarryBuilder(data, userId, useV2);
    }
}