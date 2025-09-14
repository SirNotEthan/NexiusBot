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
        
        const now = Date.now();
        const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
        const activePaidHelpers = paidHelpers.filter(helper => helper.bio_set_date > oneWeekAgo);
        
        if (activePaidHelpers.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle("💳 Paid Helper Tracker Board")
                .setDescription("No paid helpers are currently available on the tracker board.\n\n*Helpers need 10 weekly vouches to set their bio and appear here.*")
                .setColor(0x99aab5)
                .setFooter({ text: "Bios expire weekly and must be renewed" });
            
            await interaction.reply({ embeds: [embed] });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("💳 Paid Helper Tracker Board")
            .setDescription("Available paid helpers for commission work:")
            .setColor(0x00d4aa)
            .setTimestamp();

        const sortedHelpers = activePaidHelpers.sort((a, b) => b.bio_set_date - a.bio_set_date);

        let description = '';
        for (let i = 0; i < sortedHelpers.length && i < 10; i++) {
            const helper = sortedHelpers[i];
            const daysAgo = Math.floor((now - helper.bio_set_date) / (1000 * 60 * 60 * 24));
            const expiresIn = 7 - daysAgo;
            
            const helperStats = await db.getHelper(helper.user_id);
            const vouchCount = helperStats?.total_vouches || 0;
            const rating = helperStats?.average_rating?.toFixed(1) || '0.0';
            
            description += `**${i + 1}. ${helper.user_tag}**\n`;
            description += `📊 ${vouchCount} vouches | ⭐ ${rating}/5.0 | ⏰ ${expiresIn}d left\n`;
            description += `💼 *${helper.bio}*\n\n`;
        }

        embed.setDescription(description);
        embed.setFooter({ 
            text: `${sortedHelpers.length} active paid helpers | Bios expire weekly` 
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

export async function processBioSetting(userId: string, userTag: string, bio: string): Promise<void> {
    const db = new Database();
    await db.connect();
    
    try {
        const helper = await db.getHelper(userId);
        if (!helper || helper.weekly_vouches < 10) {
            throw new Error('Helper not qualified for paid tracker');
        }

        const existingPaidHelper = await db.getPaidHelper(userId);
        
        if (existingPaidHelper) {
            await db.updatePaidHelper(userId, {
                bio: bio,
                bio_set_date: Date.now(),
                vouches_for_access: helper.weekly_vouches
            });
        } else {
            await db.createPaidHelper({
                user_id: userId,
                user_tag: userTag,
                bio: bio,
                bio_set_date: Date.now(),
                vouches_for_access: helper.weekly_vouches
            });
        }

        await db.updateHelper(userId, { is_paid_helper: true });

    } finally {
        await db.close();
    }
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