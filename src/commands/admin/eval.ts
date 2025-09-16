import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    codeBlock
} from 'discord.js';
import { inspect } from 'util';
import Database from '../../database/database';

const data = new SlashCommandBuilder()
    .setName('eval')
    .setDescription('Execute JavaScript code (Owner only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
        option.setName('code')
        .setDescription('JavaScript code to execute')
        .setRequired(true)
    )
    .addBooleanOption(option =>
        option.setName('ephemeral')
        .setDescription('Whether to send the response as ephemeral (default: true)')
        .setRequired(false)
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

    const code = interaction.options.getString('code', true);
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? true;

    const dangerousPatterns = [
        /process\.exit/i,
        /require\s*\(\s*['"`]fs['"`]\s*\)/i,
        /require\s*\(\s*['"`]child_process['"`]\s*\)/i,
        /exec\s*\(/i,
        /spawn\s*\(/i,
        /\.env/i,
        /process\.env\s*=|process\.env\[.*\]\s*=/i,
        /delete\s+process/i,
        /\.token/i,
        /client\.destroy/i
    ];

    const isDangerous = dangerousPatterns.some(pattern => pattern.test(code));
    
    if (isDangerous) {
        await interaction.reply({
            content: '❌ **Security Warning**\n\nThe provided code contains potentially dangerous operations and has been blocked.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral });

    try {
        // Prepare safe execution context
        const client = interaction.client;
        const guild = interaction.guild;
        const channel = interaction.channel;
        const user = interaction.user;
        const member = interaction.member;
        const db = new Database();
        
        // Connect database for eval usage
        await db.connect();

        let evaled: any;
        const startTime = Date.now();
        
        try {
            // Execute the code
            evaled = eval(code);
            
            // Handle promises
            if (evaled instanceof Promise) {
                evaled = await evaled;
            }
        } finally {
            // Always close database connection
            await db.close();
        }

        const executionTime = Date.now() - startTime;

        // Format output
        let output = inspect(evaled, { 
            depth: 2, 
            maxArrayLength: 10,
            maxStringLength: 500
        });

        // Truncate if too long
        if (output.length > 1900) {
            output = output.substring(0, 1900) + '\n... (truncated)';
        }

        const embed = new EmbedBuilder()
            .setTitle('📝 Eval Results')
            .setColor(0x00ff00)
            .addFields([
                {
                    name: '📥 Input',
                    value: codeBlock('javascript', code.length > 500 ? code.substring(0, 500) + '\n... (truncated)' : code),
                    inline: false
                },
                {
                    name: '📤 Output',
                    value: codeBlock('javascript', output),
                    inline: false
                },
                {
                    name: '⏱️ Execution Time',
                    value: `${executionTime}ms`,
                    inline: true
                },
                {
                    name: '📊 Type',
                    value: typeof evaled,
                    inline: true
                }
            ])
            .setFooter({ 
                text: `Executed by ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

    } catch (error: any) {
        const executionTime = Date.now() - Date.now();
        
        let errorMessage = error.message || 'Unknown error occurred';
        if (errorMessage.length > 500) {
            errorMessage = errorMessage.substring(0, 500) + '\n... (truncated)';
        }

        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Eval Error')
            .setColor(0xff0000)
            .addFields([
                {
                    name: '📥 Input',
                    value: codeBlock('javascript', code.length > 500 ? code.substring(0, 500) + '\n... (truncated)' : code),
                    inline: false
                },
                {
                    name: '🚨 Error',
                    value: codeBlock('javascript', errorMessage),
                    inline: false
                },
                {
                    name: '📝 Error Type',
                    value: error.name || 'Error',
                    inline: true
                }
            ])
            .setFooter({ 
                text: `Executed by ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

export default { data, execute };