import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    TextDisplayBuilder,
    SeparatorBuilder,
    ContainerBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder
} from 'discord.js';
import path from 'path';
import Database from '../../database/database';
import { FREE_CARRIES_CONFIG, getGameDisplayName } from '../../config/freeCarriesConfig';

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
            { name: 'Middleman Terms', value: 'middleman-terms'},
            { name: 'Service Info', value: 'service-info'}
        )
    );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        const embedType = interaction.options.getString('type', true);
        
        if (embedType === 'carry-request') {
            await sendCarryRequestEmbed(interaction);
        } else if (embedType === 'middleman-terms') {
            await sendMiddlemanTermsEmbed(interaction);
        } else if (embedType === 'service-info') {
            await sendServiceInfoEmbed(interaction);
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
    const components = [];

    const mainContainer = new ContainerBuilder().setAccentColor(0xFF10F0);
    if (!(mainContainer as any).components) {
        (mainContainer as any).components = [];
    }

    const headerText = new TextDisplayBuilder()
        .setContent(`# Carry Requests\n**Welcome to our carry service!**\n\nPlease note that we will only help you complete 5 runs for free for each ticket that you make.\n\nAlso boosters are able to bypass the message requirement.\n\nClick the button below to create a carry request ticket and get started!`);
    (mainContainer as any).components.push(headerText);

    (mainContainer as any).components.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));

    const gamesText = new TextDisplayBuilder()
        .setContent(`**Supported Games:**\n**Anime Last Stand** (ALS)\n**Anime Vanguards** (AV)\n**Anime Crusaders** (AC)`);
    (mainContainer as any).components.push(gamesText);

    (mainContainer as any).components.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));

    const imageAttachment = new AttachmentBuilder(
        path.join(process.cwd(), 'images', 'TicketEmbedImage.png'),
        { name: 'TicketEmbedImage.png' }
    );

    const thumbnail = new MediaGalleryBuilder()
        .addItems(
            new MediaGalleryItemBuilder()
                .setURL('attachment://TicketEmbedImage.png')
                .setDescription('Ticket Embed Image')
        );
    (mainContainer as any).components.push(thumbnail);

    components.push(mainContainer);

    const button = new ButtonBuilder()
        .setCustomId('carry_request_embed_v2')
        .setLabel('Request Carry')
        .setEmoji('🎫')
        .setStyle(ButtonStyle.Primary);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
    components.push(buttonRow);

    await interaction.reply({
        components,
        files: [imageAttachment],
        flags: MessageFlags.IsComponentsV2
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

async function sendServiceInfoEmbed(interaction: ChatInputCommandInteraction): Promise<void> {
    const embed = new EmbedBuilder()
        .setTitle('📊 Service Information')
        .setDescription('**Learn about our carry service limits and requirements**\n\nSelect a game below to view detailed information about free carry limits for each gamemode.')
        .setColor(0x5865f2)
        .addFields([
            {
                name: '🎮 **Available Games**',
                value: '• **Anime Last Stand (ALS)**\n• **Anime Vanguards (AV)**\n• **Anime Crusaders (AC)**',
                inline: false
            },
            {
                name: '📋 **General Requirements**',
                value: '• At least 50 messages in the server today\n• Stay within daily limits for each gamemode\n• Limits reset daily at midnight UTC',
                inline: false
            },
            {
                name: '💡 **How It Works**',
                value: '• Free carries are limited per gamemode per day\n• Different gamemodes have different limits\n• Use the dropdown below to see specific limits',
                inline: false
            }
        ])
        .setFooter({ 
            text: 'Select a game below to view detailed carry limits',
            iconURL: interaction.client.user?.displayAvatarURL()
        })
        .setTimestamp();

    const gameSelectMenu = new StringSelectMenuBuilder()
        .setCustomId('service_info_game_select')
        .setPlaceholder('Select a game to view carry limits...')
        .addOptions([
            new StringSelectMenuOptionBuilder()
                .setLabel('Anime Last Stand (ALS)')
                .setDescription('View free carry limits for ALS gamemodes')
                .setValue('als')
                .setEmoji('⚔️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Anime Vanguards (AV)')
                .setDescription('View free carry limits for AV gamemodes')
                .setValue('av')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Anime Crusaders (AC)')
                .setDescription('View free carry limits for AC gamemodes')
                .setValue('ac')
                .setEmoji('⚡')
        ]);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gameSelectMenu);

    await interaction.reply({
        embeds: [embed],
        components: [row]
    });
}

async function sendCommandV2Embed(interaction: ChatInputCommandInteraction): Promise<void> {
    const embed = new EmbedBuilder()
        .setTitle('Command V2')
        .setDescription('**Command V2** - Advanced carry request system with improved features.')
        .setColor('LuminousVividPink')
        .setTimestamp();

    const button = new ButtonBuilder()
        .setCustomId('command_v2_carry_request')
        .setLabel('Request Carry')
        .setEmoji('🎫')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    await interaction.reply({
        content: 'Command V2',
        embeds: [embed],
        components: [row]
    });
}

export default { data, execute };