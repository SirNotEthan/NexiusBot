import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} from 'discord.js';
import Database from '../../database/database';

const data = new SlashCommandBuilder()
    .setName('reset-daily')
    .setDescription('Manually trigger daily reset (Owner only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption(option =>
        option.setName('confirm')
        .setDescription('Confirm you want to reset daily stats')
        .setRequired(true)
    );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const ALLOWED_USERS = process.env.BOT_OWNER_IDS?.split(',') || [];

    if (!ALLOWED_USERS.includes(interaction.user.id)) {
        await interaction.reply({
            content: '❌ **Access Denied**\n\nThis command is restricted to bot owners only.',
            ephemeral: true
        });
        return;
    }

    const confirm = interaction.options.getBoolean('confirm', true);

    if (!confirm) {
        await interaction.reply({
            content: '❌ **Reset Cancelled**\n\nPlease set confirm to `true` to reset daily stats.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    const db = new Database();

    try {
        await db.connect();

        const beforeQuery = 'SELECT COUNT(*) as count FROM user_messages WHERE date = ?';
        const today = new Date().toISOString().split('T')[0];
        const beforeStats = db['db']!.prepare(beforeQuery).get([today]) as { count: number };

        const beforeCarryQuery = 'SELECT COUNT(*) as count FROM free_carry_usage WHERE date = ?';
        const beforeCarryStats = db['db']!.prepare(beforeCarryQuery).get([today]) as { count: number };

        await db.resetDailyStats();

        const afterQuery = 'SELECT COUNT(*) as count FROM user_messages WHERE date = ?';
        const afterStats = db['db']!.prepare(afterQuery).get([today]) as { count: number };

        const afterCarryQuery = 'SELECT COUNT(*) as count FROM free_carry_usage WHERE date = ?';
        const afterCarryStats = db['db']!.prepare(afterCarryQuery).get([today]) as { count: number };

        const embed = new EmbedBuilder()
            .setTitle('🔄 Daily Reset Completed')
            .setColor(0x00ff00)
            .setDescription('Daily stats have been manually reset successfully.')
            .addFields([
                {
                    name: '📊 Message Records',
                    value: `Before: ${beforeStats.count} records\nAfter: ${afterStats.count} records\nDeleted: ${beforeStats.count - afterStats.count} records`,
                    inline: false
                },
                {
                    name: '🎫 Free Carry Usage Records',
                    value: `Before: ${beforeCarryStats.count} records\nAfter: ${afterCarryStats.count} records\nDeleted: ${beforeCarryStats.count - afterCarryStats.count} records`,
                    inline: false
                },
                {
                    name: '⏰ Reset Time',
                    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                    inline: false
                }
            ])
            .setFooter({
                text: `Executed by ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

    } catch (error: any) {
        console.error('Error in reset-daily command:', error);

        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Reset Failed')
            .setColor(0xff0000)
            .setDescription('An error occurred while resetting daily stats.')
            .addFields([
                {
                    name: '🚨 Error',
                    value: error.message || 'Unknown error',
                    inline: false
                }
            ])
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
    } finally {
        await db.close();
    }
}

export default { data, execute };
