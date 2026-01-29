import { ButtonInteraction } from 'discord.js';

export async function handleTaxButton(interaction: ButtonInteraction): Promise<void> {
  const [, action] = interaction.customId.split('_');

  switch (action) {
    case 'paid':
      await handleTaxPaid(interaction);
      break;
    default:
      await interaction.reply({ content: '❌ Action non reconnue.' });
  }
}

async function handleTaxPaid(interaction: ButtonInteraction): Promise<void> {
  await interaction.reply({ content: '✅ Paiement enregistré.' });
}
