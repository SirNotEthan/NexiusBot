import {
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    FileBuilder,
    SeparatorBuilder,
    ContainerBuilder,
    ButtonBuilder,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    MessageFlags,
    MessageCreateOptions,
    MessageEditOptions,
    InteractionReplyOptions,
    InteractionUpdateOptions,
    EmbedBuilder
} from 'discord.js';

/**
 * Modern Component Builder for Discord Components V2
 * Provides a fluent interface for building complex component layouts
 */
export class ModernComponentBuilder {
    private components: any[] = [];
    private useV2 = false;

    /**
     * Enable Components V2 mode
     */
    enableV2(): this {
        this.useV2 = true;
        return this;
    }

    /**
     * Add a text display component with markdown support
     */
    addText(content: string): this {
        if (this.useV2) {
            const textDisplay = new TextDisplayBuilder().setContent(content);
            this.components.push(textDisplay);
        } else {
            // Fallback to embed for V1 compatibility
            const embed = new EmbedBuilder()
                .setDescription(content)
                .setColor(0x5865f2);
            this.components.push(embed);
        }
        return this;
    }

    /**
     * Add a section with text and optional accessory
     */
    addSection(content: string, accessory?: ButtonBuilder | ThumbnailBuilder): this {
        if (this.useV2) {
            const section = new SectionBuilder();
            (section as any).data = { content };
            if (accessory) {
                (section as any).accessory = accessory;
            }
            this.components.push(section);
        } else {
            // Fallback to embed field for V1
            const embed = new EmbedBuilder()
                .addFields({ name: '\u200b', value: content })
                .setColor(0x5865f2);
            this.components.push(embed);
            if (accessory instanceof ButtonBuilder) {
                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(accessory);
                this.components.push(row);
            }
        }
        return this;
    }

    /**
     * Add a separator for visual spacing
     */
    addSeparator(): this {
        if (this.useV2) {
            this.components.push(new SeparatorBuilder());
        }
        // No fallback needed for V1 - separators are purely visual
        return this;
    }

    /**
     * Add a container to group components
     */
    addContainer(builder: (container: ContainerBuilder) => ContainerBuilder): this {
        if (this.useV2) {
            const container = new ContainerBuilder();
            this.components.push(builder(container));
        }
        // V1 fallback: containers aren't supported, components will be added directly
        return this;
    }

    /**
     * Add interactive buttons
     */
    addButtons(buttons: ButtonBuilder[]): this {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
        this.components.push(row);
        return this;
    }

    /**
     * Add a select menu
     */
    addSelectMenu(selectMenu: StringSelectMenuBuilder): this {
        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        this.components.push(row);
        return this;
    }

    /**
     * Add a thumbnail image
     */
    addThumbnail(url: string, altText?: string): this {
        if (this.useV2) {
            const thumbnail = new ThumbnailBuilder()
                .setURL(url);
            if (altText) {
                (thumbnail as any).data = { ...(thumbnail as any).data, alt_text: altText };
            }
            this.components.push(thumbnail);
        } else {
            // V1 fallback: add to the last embed if possible
            const lastComponent = this.components[this.components.length - 1];
            if (lastComponent instanceof EmbedBuilder) {
                lastComponent.setThumbnail(url);
            }
        }
        return this;
    }

    /**
     * Build the final message options
     */
    build(): MessageCreateOptions & InteractionReplyOptions & MessageEditOptions & InteractionUpdateOptions {
        if (this.useV2) {
            return {
                components: this.components,
                flags: MessageFlags.IsComponentsV2
            };
        } else {
            // Separate embeds from action rows for V1
            const embeds = this.components.filter(c => c instanceof EmbedBuilder);
            const actionRows = this.components.filter(c => c instanceof ActionRowBuilder);
            
            return {
                embeds: embeds.length > 0 ? embeds : undefined,
                components: actionRows.length > 0 ? actionRows : undefined
            };
        }
    }

    /**
     * Get component count for validation
     */
    getComponentCount(): number {
        return this.components.length;
    }

    /**
     * Clear all components
     */
    clear(): this {
        this.components = [];
        return this;
    }
}

/**
 * Utility class for creating common component patterns
 */
export class ComponentPatterns {
    /**
     * Create a header section with title and description
     */
    static createHeader(title: string, description?: string, useV2 = false): ModernComponentBuilder {
        const builder = new ModernComponentBuilder();
        if (useV2) {
            builder.enableV2();
        }
        
        let content = `# ${title}`;
        if (description) {
            content += `\n${description}`;
        }
        
        return builder.addText(content);
    }

    /**
     * Create a form-like layout with fields
     */
    static createForm(title: string, fields: { name: string; value: string; required?: boolean }[], useV2 = false): ModernComponentBuilder {
        const builder = new ModernComponentBuilder();
        if (useV2) {
            builder.enableV2();
        }

        builder.addText(`# ${title}`);
        
        fields.forEach((field, index) => {
            const indicator = field.required ? '❌ *Required*' : '✅ *Set*';
            const fieldContent = `**${field.name}**\n${field.value || indicator}`;
            
            builder.addSection(fieldContent);
            
            // Add separator between fields except for the last one
            if (index < fields.length - 1) {
                builder.addSeparator();
            }
        });

        return builder;
    }

    /**
     * Create a status display with icon and message
     */
    static createStatus(status: 'success' | 'error' | 'warning' | 'info', message: string, useV2 = false): ModernComponentBuilder {
        const builder = new ModernComponentBuilder();
        if (useV2) {
            builder.enableV2();
        }

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        return builder.addText(`${icons[status]} ${message}`);
    }

    /**
     * Create a progress indicator
     */
    static createProgress(current: number, total: number, label?: string, useV2 = false): ModernComponentBuilder {
        const builder = new ModernComponentBuilder();
        if (useV2) {
            builder.enableV2();
        }

        const percentage = Math.round((current / total) * 100);
        const progressBar = "▓".repeat(Math.floor(current / total * 10)) + "░".repeat(10 - Math.floor(current / total * 10));
        
        let content = `**Progress:** ${current}/${total} (${percentage}%)\n${progressBar}`;
        if (label) {
            content = `**${label}**\n${content}`;
        }

        return builder.addText(content);
    }
}