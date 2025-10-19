import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    EmbedBuilder,
    PermissionFlagsBits,
    User
} from 'discord.js';
import Database from '../../database/database';

const data = new SlashCommandBuilder()
    .setName("manage-paid-helpers")
    .setDescription("Staff command to manage paid helpers")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Register a user as a paid helper')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User to register as paid helper')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove')
            .setDescription('Remove a paid helper registration')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User to remove from paid helpers')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('List all registered paid helpers')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('eligible')
            .setDescription('List helpers eligible for paid helper status (10+ regular vouches)')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('promote')
            .setDescription('Promote an eligible helper to paid helper status')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('Helper to promote (must have 10+ regular vouches)')
                    .setRequired(true)
            )
    );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        if (!interaction.member || !interaction.guild) {
            await interaction.reply({
                content: "❌ This command can only be used in a server!",
                ephemeral: true
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'add':
                await handleAddPaidHelper(interaction);
                break;
            case 'remove':
                await handleRemovePaidHelper(interaction);
                break;
            case 'list':
                await handleListPaidHelpers(interaction);
                break;
            case 'eligible':
                await handleListEligibleHelpers(interaction);
                break;
            case 'promote':
                await handlePromoteHelper(interaction);
                break;
            default:
                await interaction.reply({ 
                    content: '❌ Unknown subcommand.', 
                    ephemeral: true 
                });
        }
    } catch (error) {
        console.error("Error in manage-paid-helpers command:", error);
        await handleCommandError(interaction, error);
    }
}

async function handleAddPaidHelper(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser('user', true);

    const db = new Database();
    await db.connect();

    try {
        const existingPaidHelper = await db.getPaidHelper(user.id);
        if (existingPaidHelper) {
            const embed = new EmbedBuilder()
                .setTitle("⚠️ User Already Registered")
                .setDescription(`${user.tag} is already registered as a paid helper.`)
                .setColor(0xffa500);

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        let helper = await db.getHelper(user.id);
        if (!helper) {
            await db.createHelper({
                user_id: user.id,
                user_tag: user.tag,
                helper_rank: 'Helper',
                total_vouches: 0,
                helper_since: Date.now(),
                weekly_vouches: 0,
                monthly_vouches: 0,
                average_rating: 0.0,
                is_paid_helper: true,
                vouches_for_paid_access: 0
            });
        } else {
            await db.updateHelper(user.id, { 
                is_paid_helper: true,
                user_tag: user.tag 
            });
        }

        await db.createPaidHelper({
            user_id: user.id,
            user_tag: user.tag,
            vouches_for_access: 0,
        });

        const successEmbed = new EmbedBuilder()
            .setTitle("✅ Paid Helper Registered")
            .setDescription(`Successfully registered ${user.tag} as a paid helper!`)
            .setThumbnail(user.displayAvatarURL())
            .addFields([
                { name: 'User', value: `${user} (${user.tag})`, inline: true },
                { name: 'User ID', value: user.id, inline: true },
            ])
            .setColor(0x00ff00)
            .setTimestamp();

        await interaction.reply({ embeds: [successEmbed] });

    } finally {
        await db.close();
    }
}

async function handleRemovePaidHelper(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser('user', true);

    const db = new Database();
    await db.connect();

    try {
        const paidHelper = await db.getPaidHelper(user.id);
        
        if (!paidHelper) {
            const embed = new EmbedBuilder()
                .setTitle("❌ Not a Paid Helper")
                .setDescription(`${user.tag} is not registered as a paid helper.`)
                .setColor(0xff6b6b);

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        // Remove paid helper status
        await db.updateHelper(user.id, { is_paid_helper: false });

        const successEmbed = new EmbedBuilder()
            .setTitle("✅ Paid Helper Removed")
            .setDescription(`Successfully removed ${user.tag} from paid helpers list.`)
            .setThumbnail(user.displayAvatarURL())
            .addFields([
                { name: '👤 User', value: `${user} (${user.tag})`, inline: true }
            ])
            .setColor(0xff6b6b)
            .setTimestamp();

        await interaction.reply({ embeds: [successEmbed] });

    } finally {
        await db.close();
    }
}

async function handleListPaidHelpers(interaction: ChatInputCommandInteraction): Promise<void> {
    const db = new Database();
    await db.connect();

    try {
        const paidHelpers = await db.getAllPaidHelpers();

        if (paidHelpers.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle("📋 Paid Helpers List")
                .setDescription("No paid helpers are currently registered.")
                .setColor(0x99aab5)
                .setFooter({ text: "Use /manage-paid-helpers add to register paid helpers" });

            await interaction.reply({ embeds: [embed] });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("📋 Registered Paid Helpers")
            .setDescription(`${paidHelpers.length} paid helper${paidHelpers.length !== 1 ? 's' : ''} currently registered:`)
            .setColor(0x00d4aa)
            .setTimestamp();

        for (let i = 0; i < Math.min(paidHelpers.length, 10); i++) {
            const helper = paidHelpers[i];

            embed.addFields([
                {
                    name: `${i + 1}. ${helper.user_tag}`,
                    value: `**User ID:** \`${helper.user_id}\``,
                    inline: false
                }
            ]);
        }

        if (paidHelpers.length > 10) {
            embed.setFooter({
                text: `Showing first 10 of ${paidHelpers.length} paid helpers`
            });
        }

        await interaction.reply({ embeds: [embed] });

    } finally {
        await db.close();
    }
}

// Bio functionality removed - no longer needed

async function handleCommandError(interaction: ChatInputCommandInteraction, error: any): Promise<void> {
    console.error("Manage paid helpers command error:", error);
    
    try {
        const errorMessage = "❌ Failed to execute command. Please try again later.";
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    } catch (followUpError) {
        console.error("Failed to send error message:", followUpError);
    }
}

async function handleListEligibleHelpers(interaction: ChatInputCommandInteraction): Promise<void> {
    const db = new Database();
    await db.connect();

    try {
        const eligibleHelpers = await db.getEligibleForPaidHelperStatus();

        if (eligibleHelpers.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle("📋 Eligible for Paid Helper Status")
                .setDescription("No helpers are currently eligible for paid helper status.\n\nHelpers need 10 regular vouches this week to be eligible.")
                .setColor(0x99aab5)
                .setFooter({ text: "Eligibility resets weekly on Sunday" });

            await interaction.reply({ embeds: [embed] });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("🎯 Helpers Eligible for Paid Status")
            .setDescription(`${eligibleHelpers.length} helper${eligibleHelpers.length !== 1 ? 's' : ''} currently eligible for promotion:`)
            .setColor(0x00d4aa)
            .setTimestamp();

        for (let i = 0; i < Math.min(eligibleHelpers.length, 10); i++) {
            const helper = eligibleHelpers[i];
            embed.addFields([
                {
                    name: `${i + 1}. ${helper.user_tag}`,
                    value: `**Paid Access Vouches:** ${helper.vouches_for_paid_access}/10 ✅\n**Total Vouches:** ${helper.total_vouches}\n**Weekly Vouches:** ${helper.weekly_vouches}\n**Average Rating:** ${helper.average_rating.toFixed(1)}/5\n**ID:** \`${helper.user_id}\``,
                    inline: false
                }
            ]);
        }

        if (eligibleHelpers.length > 10) {
            embed.setFooter({ 
                text: `Showing first 10 of ${eligibleHelpers.length} eligible helpers • Use /manage-paid-helpers promote to promote them` 
            });
        } else {
            embed.setFooter({ 
                text: "Use /manage-paid-helpers promote to promote eligible helpers" 
            });
        }

        await interaction.reply({ embeds: [embed] });

    } finally {
        await db.close();
    }
}

async function handlePromoteHelper(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser('user', true);

    const db = new Database();
    await db.connect();

    try {
        const eligibility = await db.checkPaidHelperEligibility(user.id);
        if (!eligibility.eligible) {
            const embed = new EmbedBuilder()
                .setTitle("❌ Not Eligible for Promotion")
                .setDescription(`${user.tag} is not eligible for paid helper status.`)
                .setColor(0xff6b6b)
                .addFields([
                    { name: '📊 Current Status', value: `**Vouches for Paid Access:** ${eligibility.currentVouches}/10\n**Vouches Still Needed:** ${eligibility.vouchesNeeded}`, inline: false },
                    { name: '📝 Requirements', value: 'Helper must earn 10 regular vouches within a single week to become eligible for paid helper status.', inline: false }
                ]);

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        const existingPaidHelper = await db.getPaidHelper(user.id);
        if (existingPaidHelper) {
            const embed = new EmbedBuilder()
                .setTitle("⚠️ Already a Paid Helper")
                .setDescription(`${user.tag} is already registered as a paid helper.`)
                .setColor(0xffa500);

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        await db.updateHelper(user.id, {
            is_paid_helper: true,
            user_tag: user.tag
        });

        await db.createPaidHelper({
            user_id: user.id,
            user_tag: user.tag,
            vouches_for_access: 10
        });

        const successEmbed = new EmbedBuilder()
            .setTitle("🎉 Helper Promoted!")
            .setDescription(`Successfully promoted ${user.tag} to paid helper status!`)
            .setThumbnail(user.displayAvatarURL())
            .addFields([
                { name: '👤 User', value: `${user} (${user.tag})`, inline: true },
                { name: '📊 Qualification', value: `Earned ${eligibility.currentVouches} regular vouches this week`, inline: true }
            ])
            .setColor(0x00ff00)
            .setTimestamp();

        await interaction.reply({ embeds: [successEmbed] });

    } finally {
        await db.close();
    }
}

export default { data, execute };