import { ModalSubmitInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getDatabase } from '../../database';

function hasHelperRole(member: any, game?: string): boolean {
    if (game) {
        const gameHelperRoleId = getGameHelperRoleId(game);
        if (gameHelperRoleId && member.roles.cache.has(gameHelperRoleId)) {
            return true;
        }
    }
    
    const helperRoleIds = process.env.HELPER_ROLE_IDS?.split(',') || [];
    return helperRoleIds.some(roleId => member.roles.cache.has(roleId.trim()));
}

function getGameHelperRoleId(game: string): string | undefined {
    const gamePrefix = game.toUpperCase();
    const envVar = `${gamePrefix}_HELPER_ROLE_ID`;
    
    return process.env[envVar];
}

export async function handleEditTicketModal(interaction: ModalSubmitInteraction): Promise<void> {
    const db = getDatabase();
    const ticket = await db.getTicketByChannelId(interaction.channelId!);
    
    if (!ticket) {
        await interaction.reply({
            content: "❌ Could not find ticket information in database.",
            ephemeral: true
        });
        return;
    }

    const newGamemode = interaction.fields.getTextInputValue('edit_gamemode');
    const newGoal = interaction.fields.getTextInputValue('edit_goal');
    const newContact = interaction.fields.getTextInputValue('edit_contact');

    await db.updateTicket(ticket.ticket_number, {
        gamemode: newGamemode,
        goal: newGoal,
        contact: newContact
    });

    const updatedTicket = await db.getTicket(ticket.ticket_number);
    if (!updatedTicket) {
        await interaction.reply({
            content: "❌ Error updating ticket information.",
            ephemeral: true
        });
        return;
    }

    const statusIcon = updatedTicket.status === 'open' ? '🟡' : updatedTicket.status === 'claimed' ? '🟢' : '🔴';
    const statusText = updatedTicket.status === 'open' ? 'Open' : updatedTicket.status === 'claimed' ? 'Claimed' : 'Closed';

    const updatedEmbed = new EmbedBuilder()
        .setTitle(`🎫 Support Ticket #${updatedTicket.ticket_number}`)
        .setDescription(`**Ticket ID:** \`#${updatedTicket.ticket_number}\`\n**Status:** ${statusIcon} ${statusText}`)
        .setColor(updatedTicket.status === 'open' ? 0x5865f2 : updatedTicket.status === 'claimed' ? 0x00ff00 : 0xff0000)
        .addFields([
            {
                name: "🎮 **Gamemode**",
                value: `\`${updatedTicket.gamemode}\``,
                inline: true
            },
            {
                name: "🎯 **Goal**",
                value: `\`${updatedTicket.goal}\``,
                inline: true
            },
            {
                name: "📞 **Contact**",
                value: `\`${updatedTicket.contact}\``,
                inline: true
            },
            {
                name: "👤 **Submitted by**",
                value: `<@${updatedTicket.user_id}> (\`${updatedTicket.user_tag}\`)`,
                inline: false
            }
        ])
        .setFooter({ 
            text: `Ticket #${updatedTicket.ticket_number} • Last edited by ${interaction.user.tag}`,
            iconURL: interaction.client.user?.displayAvatarURL()
        })
        .setTimestamp();

    if (updatedTicket.claimed_by) {
        updatedEmbed.addFields({
            name: "🤝 **Claimed by**",
            value: `<@${updatedTicket.claimed_by}> (\`${updatedTicket.claimed_by_tag}\`)`,
            inline: false
        });
    }

    const buttons: ButtonBuilder[] = [];

    if (updatedTicket.status === 'open') {
        buttons.push(
            new ButtonBuilder()
                .setCustomId('claim_ticket')
                .setLabel('Claim Ticket')
                .setEmoji('✋')
                .setStyle(ButtonStyle.Success)
        );
    }

    if (updatedTicket.status !== 'closed') {
        buttons.push(
            new ButtonBuilder()
                .setCustomId('edit_ticket')
                .setLabel('Edit Ticket')
                .setEmoji('✏️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Close Ticket')
                .setEmoji('🔒')
                .setStyle(ButtonStyle.Danger)
        );
    }

    const components = buttons.length > 0 ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [];

    const originalMessage = interaction.message;
    if (originalMessage) {
        await interaction.deferUpdate();
        await interaction.editReply({
            embeds: [updatedEmbed],
            components: components
        });

        await interaction.followUp({
            content: `✅ **Ticket #${updatedTicket.ticket_number} has been updated by ${interaction.user}**`,
            ephemeral: false
        });
    } else {
        await interaction.reply({
            content: `✅ **Ticket #${updatedTicket.ticket_number} has been updated successfully!**`,
            ephemeral: true
        });
    }
}