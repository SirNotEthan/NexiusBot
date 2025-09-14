import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder
} from 'discord.js';
import Database from '../../database/database';

const data = new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Resend Embeds if broken or deleted.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
        option.setName('type')
        .setDescription('Select an Embed to send.')
        .setRequired(true)
        .addChoices(
            { name: 'Carry Request', value: 'carry-request'}
        )
    );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        const embedType = interaction.options.getString('type', true);
        
        if (embedType === 'carry-request') {
            await sendCarryRequestEmbed(interaction);
        }
    } catch (error) {
        console.error("Error in embed command:", error);
        await interaction.reply({
            content: "❌ Failed to send embed. Please try again later.",
            ephemeral: true
        });
    }
}

async function sendCarryRequestEmbed(interaction: ChatInputCommandInteraction): Promise<void> {
    const attachment = new AttachmentBuilder('images/TicketEmbedImage.png', { name: 'ticket-embed-image.png' });
    
    const embed = new EmbedBuilder()
        .setTitle('🎮 Carry Requests')
        .setDescription('**Welcome to our carry service!**\n\nPlease note that we will only help you complete 5 runs for free for each ticket that you make.\n\nClick the button below to create a carry request ticket and get started!')
        .setColor(0x5865f2)
        .addFields([
            {
                name: '🎲 Supported Games',
                value: '• **Anime Last Stand** (ALS)\n• **Anime Vanguards** (AV)',
                inline: false
            }
        ])
        .setImage('attachment://ticket-embed-image.png')
        .setFooter({ text: 'Our helpers are here to assist you!' })

    const button = new ButtonBuilder()
        .setCustomId('carry_request_embed_button')
        .setLabel('Request Carry')
        .setEmoji('🎫')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    await interaction.reply({
        embeds: [embed],
        components: [row],
        files: [attachment]
    });
}

export default { data, execute };