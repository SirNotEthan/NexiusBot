import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    User
} from 'discord.js';

const data = new SlashCommandBuilder()
    .setName('ticket-blacklist')
    .setDescription('Manage ticket blacklist - prevent users from creating carry requests')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Add a user to the ticket blacklist')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user to blacklist from tickets')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for blacklisting')
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove')
            .setDescription('Remove a user from the ticket blacklist')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user to remove from blacklist')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('check')
            .setDescription('Check if a user is blacklisted')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user to check')
                    .setRequired(true)
            )
    );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'add') {
            await handleAddBlacklist(interaction);
        } else if (subcommand === 'remove') {
            await handleRemoveBlacklist(interaction);
        } else if (subcommand === 'check') {
            await handleCheckBlacklist(interaction);
        }
    } catch (error) {
        console.error('Error in ticket-blacklist command:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing the blacklist command.',
            ephemeral: true
        });
    }
}

async function handleAddBlacklist(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!interaction.guild) {
        await interaction.reply({
            content: '❌ This command can only be used in a server.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const blacklistRoleId = process.env.TICKET_BLACKLIST_ROLE_ID;

        if (!blacklistRoleId) {
            await interaction.editReply({
                content: '❌ **Configuration Error**\n\nThe `TICKET_BLACKLIST_ROLE_ID` environment variable is not set. Please add it to your .env file.'
            });
            return;
        }

        const member = await interaction.guild.members.fetch(user.id);

        if (!member) {
            await interaction.editReply({
                content: '❌ **User Not Found**\n\nCould not find this user in the server.'
            });
            return;
        }

        if (member.roles.cache.has(blacklistRoleId)) {
            await interaction.editReply({
                content: `⚠️ **Already Blacklisted**\n\n${user} is already blacklisted from creating tickets.`
            });
            return;
        }

        await member.roles.add(blacklistRoleId, `Blacklisted by ${interaction.user.tag}: ${reason}`);

        const embed = new EmbedBuilder()
            .setTitle('🚫 User Blacklisted from Tickets')
            .setColor(0xff0000)
            .addFields([
                {
                    name: '👤 User',
                    value: `${user} (${user.tag})`,
                    inline: true
                },
                {
                    name: '👮 Blacklisted By',
                    value: `${interaction.user} (${interaction.user.tag})`,
                    inline: true
                },
                {
                    name: '📝 Reason',
                    value: reason,
                    inline: false
                }
            ])
            .setFooter({
                text: `User ID: ${user.id}`,
                iconURL: user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed]
        });

        console.log(`[TICKET_BLACKLIST] ${user.tag} (${user.id}) blacklisted by ${interaction.user.tag} - Reason: ${reason}`);

    } catch (error) {
        console.error('Error adding user to blacklist:', error);
        await interaction.editReply({
            content: '❌ Failed to add user to blacklist. Please check my permissions and try again.'
        });
    }
}

async function handleRemoveBlacklist(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser('user', true);

    if (!interaction.guild) {
        await interaction.reply({
            content: '❌ This command can only be used in a server.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const blacklistRoleId = process.env.TICKET_BLACKLIST_ROLE_ID;

        if (!blacklistRoleId) {
            await interaction.editReply({
                content: '❌ **Configuration Error**\n\nThe `TICKET_BLACKLIST_ROLE_ID` environment variable is not set. Please add it to your .env file.'
            });
            return;
        }

        const member = await interaction.guild.members.fetch(user.id);

        if (!member) {
            await interaction.editReply({
                content: '❌ **User Not Found**\n\nCould not find this user in the server.'
            });
            return;
        }

        if (!member.roles.cache.has(blacklistRoleId)) {
            await interaction.editReply({
                content: `⚠️ **Not Blacklisted**\n\n${user} is not currently blacklisted from tickets.`
            });
            return;
        }

        await member.roles.remove(blacklistRoleId, `Unblacklisted by ${interaction.user.tag}`);

        const embed = new EmbedBuilder()
            .setTitle('✅ User Removed from Ticket Blacklist')
            .setColor(0x00ff00)
            .addFields([
                {
                    name: '👤 User',
                    value: `${user} (${user.tag})`,
                    inline: true
                },
                {
                    name: '👮 Removed By',
                    value: `${interaction.user} (${interaction.user.tag})`,
                    inline: true
                }
            ])
            .setFooter({
                text: `User ID: ${user.id}`,
                iconURL: user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed]
        });

        console.log(`[TICKET_BLACKLIST] ${user.tag} (${user.id}) removed from blacklist by ${interaction.user.tag}`);

    } catch (error) {
        console.error('Error removing user from blacklist:', error);
        await interaction.editReply({
            content: '❌ Failed to remove user from blacklist. Please check my permissions and try again.'
        });
    }
}

async function handleCheckBlacklist(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser('user', true);

    if (!interaction.guild) {
        await interaction.reply({
            content: '❌ This command can only be used in a server.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const blacklistRoleId = process.env.TICKET_BLACKLIST_ROLE_ID;

        if (!blacklistRoleId) {
            await interaction.editReply({
                content: '❌ **Configuration Error**\n\nThe `TICKET_BLACKLIST_ROLE_ID` environment variable is not set. Please add it to your .env file.'
            });
            return;
        }

        const member = await interaction.guild.members.fetch(user.id);

        if (!member) {
            await interaction.editReply({
                content: '❌ **User Not Found**\n\nCould not find this user in the server.'
            });
            return;
        }

        const isBlacklisted = member.roles.cache.has(blacklistRoleId);

        const embed = new EmbedBuilder()
            .setTitle('🔍 Ticket Blacklist Status')
            .setColor(isBlacklisted ? 0xff0000 : 0x00ff00)
            .addFields([
                {
                    name: '👤 User',
                    value: `${user} (${user.tag})`,
                    inline: true
                },
                {
                    name: '📊 Status',
                    value: isBlacklisted ? '🚫 **Blacklisted**' : '✅ **Not Blacklisted**',
                    inline: true
                }
            ])
            .setDescription(
                isBlacklisted
                    ? 'This user is currently **blacklisted** from creating carry request tickets.'
                    : 'This user can currently create carry request tickets normally.'
            )
            .setFooter({
                text: `User ID: ${user.id}`,
                iconURL: user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed]
        });

    } catch (error) {
        console.error('Error checking blacklist status:', error);
        await interaction.editReply({
            content: '❌ Failed to check blacklist status. Please try again.'
        });
    }
}

export default { data, execute };
