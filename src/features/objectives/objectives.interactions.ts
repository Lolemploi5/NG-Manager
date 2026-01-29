import { ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from 'discord.js';

export async function handleObjectiveButton(interaction: ButtonInteraction): Promise<void> {
  const [, action] = interaction.customId.split('_');

  switch (action) {
    case 'contribute':
      await handleContributeButton(interaction);
      break;
    case 'approve':
      await handleApproveContribution(interaction);
      break;
    case 'reject':
      await handleRejectContribution(interaction);
      break;
    default:
      await interaction.reply({ content: '❌ Action non reconnue.' });
  }
}

export async function handleObjectiveModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.reply({ content: '⏳ Traitement de votre contribution...' });
}

export async function handleObjectiveSelect(
  interaction: StringSelectMenuInteraction
): Promise<void> {
  await interaction.reply({ content: '⏳ Sélection du critère...' });
}

async function handleContributeButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.reply({ content: '⏳ Ouverture du formulaire...' });
}

async function handleApproveContribution(interaction: ButtonInteraction): Promise<void> {
  await interaction.reply({ content: '✅ Contribution approuvée.' });
}

async function handleRejectContribution(interaction: ButtonInteraction): Promise<void> {
  await interaction.reply({ content: '❌ Contribution refusée.' });
}
