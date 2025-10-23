import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import Database from '../../database/database';

const data = new SlashCommandBuilder()
    .setName("tracker")
    .setDescription("Manage paid helper tracker board")
    .addSubcommand(subcommand =>
        subcommand
            .setName('view')
            .setDescription('View the paid helper tracker board')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('set-bio')
            .setDescription('[DEPRECATED] Self-registration is disabled - contact staff')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove-bio')
            .setDescription('[DEPRECATED] Contact staff to be removed')
    );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'view':
                await displayTrackerBoard(interaction);
                break;
            case 'set-bio':
                await handleSetBio(interaction);
                break;
            case 'remove-bio':
                await handleRemoveBio(interaction);
                break;
            default:
                await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
        }
    } catch (error) {
        console.error("Error in tracker command:", error);
        await handleTrackerError(interaction, error);
    }
}

async function displayTrackerBoard(interaction: ChatInputCommandInteraction): Promise<void> {
    const db = new Database();
    await db.connect();

    try {
        const paidHelpers = await db.getAllPaidHelpers();

        if (paidHelpers.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle("💳 Paid Helper Tracker Board")
                .setDescription("No paid helpers are currently registered.\n\n*Contact staff to be registered as a paid helper.*")
                .setColor(0x99aab5)
                .setFooter({ text: "Use /manage-paid-helpers to manage helpers (staff only)" });

            await interaction.reply({ embeds: [embed] });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("💳 Paid Helper Tracker Board")
            .setDescription("Registered paid helpers:")
            .setColor(0x00d4aa)
            .setTimestamp();

        let description = '';
        for (let i = 0; i < paidHelpers.length && i < 10; i++) {
            const helper = paidHelpers[i];

            const helperStats = await db.getHelper(helper.user_id);
            const vouchCount = helperStats?.total_vouches || 0;
            const rating = helperStats?.average_rating?.toFixed(1) || '0.0';

            description += `**${i + 1}. ${helper.user_tag}**\n`;
            description += `📊 ${vouchCount} vouches | ⭐ ${rating}/5.0\n\n`;
        }

        embed.setDescription(description);
        embed.setFooter({
            text: `${paidHelpers.length} registered paid helpers`
        });

        const refreshButton = new ButtonBuilder()
            .setCustomId(`refresh_tracker_${interaction.user.id}`)
            .setLabel('Refresh')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(refreshButton);

        await interaction.reply({
            embeds: [embed],
            components: [row]
        });

    } finally {
        await db.close();
    }
}

async function handleSetBio(interaction: ChatInputCommandInteraction): Promise<void> {
    const embed = new EmbedBuilder()
        .setTitle("❌ Self-Registration Disabled")
        .setDescription("Paid helper registration is now managed by staff only.")
        .setColor(0xff6b6b)
        .addFields([
            { name: "📝 How to become a paid helper", value: "Contact server staff to be registered as a paid helper using `/manage-paid-helpers add`.", inline: false },
            { name: "🔍 View current helpers", value: "Use `/tracker view` to see currently registered paid helpers.", inline: false }
        ])
        .setFooter({ text: "This change ensures quality control for paid services" });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleRemoveBio(interaction: ChatInputCommandInteraction): Promise<void> {
    const embed = new EmbedBuilder()
        .setTitle("❌ Self-Removal Disabled")
        .setDescription("Paid helper management is now handled by staff only.")
        .setColor(0xff6b6b)
        .addFields([
            { name: "📝 To be removed", value: "Contact server staff to be removed from paid helpers using `/manage-paid-helpers remove`.", inline: false },
            { name: "🔍 Current status", value: "Use `/paid-profile` to check your current paid helper status.", inline: false }
        ])
        .setFooter({ text: "Staff management ensures proper oversight" });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

function createBioModal(userId: string): ModalBuilder {
    const modal = new ModalBuilder()
        .setCustomId(`paid_bio_modal_${userId}`)
        .setTitle('Set Your Paid Helper Bio');

    const bioInput = new TextInputBuilder()
        .setCustomId('bio')
        .setLabel('Bio (What you can help with & payment)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('e.g., "PvM coaching, quest help, gear advice. Payment: 5m/hour or items"')
        .setMinLength(20)
        .setMaxLength(300)
        .setRequired(true);

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(bioInput);
    modal.addComponents(firstActionRow);

    return modal;
}

export async function refreshTrackerBoard(interaction: any): Promise<void> {
    await displayTrackerBoard(interaction);
}

async function handleTrackerError(interaction: ChatInputCommandInteraction, error: any): Promise<void> {
    console.error("Tracker command error:", error);
    
    try {
        const errorMessage = "❌ Failed to process tracker command. Please try again later.";
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    } catch (followUpError) {
        console.error("Failed to send tracker error message:", followUpError);
    }
}

export default { data, execute };