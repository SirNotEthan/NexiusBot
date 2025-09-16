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
            { name: 'Carry Request', value: 'carry-request'},
            { name: 'Middleman Terms', value: 'middleman-terms'}
        )
    );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        const embedType = interaction.options.getString('type', true);
        
        if (embedType === 'carry-request') {
            await sendCarryRequestEmbed(interaction);
        } else if (embedType === 'middleman-terms') {
            await sendMiddlemanTermsEmbed(interaction);
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
        .setTitle('Carry Requests')
        .setDescription('**Welcome to our carry service!**\n\nPlease note that we will only help you complete 5 runs for free for each ticket that you make.\n\nAlso boosters are able to bypass the message requirement.\n\nClick the button below to create a carry request ticket and get started!')
        .setColor('LuminousVividPink')
        .addFields([
            {
                name: ' ',
                value: '————————————————————————————',
                inline: false
            },
            {
                name: 'Supported Games',
                value: '**Anime Last Stand** (ALS)\n**Anime Vanguards** (AV)',
                inline: false
            },
            {
                name: ' ',
                value: '————————————————————————————',
                inline: false
            }
        ])
        .setImage('attachment://ticket-embed-image.png')

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

async function sendMiddlemanTermsEmbed(interaction: ChatInputCommandInteraction): Promise<void> {
    const embed = new EmbedBuilder()
        .setTitle('🛡️ Middleman Service Terms & Conditions')
        .setDescription('**Read carefully before using our middleman service**\n\nOur middleman service provides secure trading between users. By using this service, you agree to the following terms:')
        .setColor(0x00d4aa)
        .addFields([
            {
                name: '📋 **Service Overview**',
                value: '• Secure item/account trading between users\n• Professional mediation for high-value transactions\n• Protection against scams and fraud\n• Available for supported games only',
                inline: false
            },
            {
                name: '💰 **Fees & Pricing**',
                value: '• **Standard Fee:** 5% of transaction value\n• **Minimum Fee:** $2.00 USD\n• **Payment Methods:** PayPal, Crypto, Gift Cards\n• Fees are non-refundable once service begins',
                inline: false
            },
            {
                name: '⚖️ **User Responsibilities**',
                value: '• Provide accurate item/account details\n• Respond promptly to middleman requests\n• Follow all trading instructions exactly\n• Be available during scheduled trade time',
                inline: false
            },
            {
                name: '🚫 **Prohibited Items**',
                value: '• Stolen or illegally obtained items\n• Items violating game ToS\n• Real money (cash transactions)\n• Personal information or accounts outside gaming',
                inline: false
            },
            {
                name: '⏱️ **Process & Timeline**',
                value: '• **Step 1:** Request middleman service\n• **Step 2:** Both parties agree to terms\n• **Step 3:** Items/payment held in escrow\n• **Step 4:** Verification and secure transfer\n• **Typical Duration:** 2-24 hours',
                inline: false
            },
            {
                name: '🔒 **Security & Liability**',
                value: '• We verify all items before transfer\n• Screenshot evidence of all transactions\n• Zero tolerance for attempted fraud\n• Not responsible for game account bans\n• Service provided "as-is" with no warranties',
                inline: false
            },
            {
                name: '📞 **Dispute Resolution**',
                value: '• Report issues immediately to staff\n• Evidence must be provided for claims\n• Final decisions made by senior staff\n• Refunds considered case-by-case\n• Appeal process available for disputes',
                inline: false
            }
        ])
        .setFooter({ 
            text: 'By proceeding, you acknowledge reading and accepting these terms • Last updated: ' + new Date().toLocaleDateString(),
            iconURL: interaction.client.user?.displayAvatarURL()
        })
        .setTimestamp();

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents([
        new ButtonBuilder()
            .setCustomId('middleman_agree_terms')
            .setLabel('I Agree - Request Middleman')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('middleman_decline_terms')
            .setLabel('Decline')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('middleman_more_info')
            .setLabel('More Information')
            .setEmoji('📖')
            .setStyle(ButtonStyle.Secondary)
    ]);

    await interaction.reply({
        embeds: [embed],
        components: [buttons]
    });
}

export default { data, execute };