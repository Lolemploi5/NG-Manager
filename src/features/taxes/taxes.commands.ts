import { SlashCommandBuilder } from 'discord.js';

export const taxesCommands = [
  new SlashCommandBuilder()
    .setName('impots')
    .setDescription('Gestion des impôts')
    .addSubcommand((sub) =>
      sub
        .setName('config')
        .setDescription('Configurer les rappels d\'impôts')
        .addBooleanOption((opt) =>
          opt.setName('enabled').setDescription('Activer les rappels').setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('mode')
            .setDescription('Fréquence des rappels')
            .setRequired(true)
            .addChoices(
              { name: 'Jours', value: 'DAYS' },
              { name: 'Semaines', value: 'WEEKS' },
              { name: 'Mois', value: 'MONTHS' }
            )
        )
        .addIntegerOption((opt) =>
          opt
            .setName('every')
            .setDescription('Tous les X jours/semaines/mois')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('resume')
        .setDescription('Résumé des impôts à payer')
        .addStringOption((opt) =>
          opt
            .setName('entreprise_id')
            .setDescription('Filtrer par entreprise')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('generer')
        .setDescription('Générer un rappel maintenant')
        .addStringOption((opt) =>
          opt
            .setName('entreprise_id')
            .setDescription('Entreprise concernée')
            .setRequired(false)
        )
    ),
];

export async function handleTaxesCommand(interaction: any): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'config':
      await handleConfigTaxes(interaction);
      break;
    case 'resume':
      await handleResumeTaxes(interaction);
      break;
    case 'generer':
      await handleGenerateTaxReminder(interaction);
      break;
  }
}

async function handleConfigTaxes(interaction: any): Promise<void> {
  await interaction.reply({ content: '⏳ Configuration des rappels...' });
}

async function handleResumeTaxes(interaction: any): Promise<void> {
  await interaction.reply({ content: '⏳ Calcul du résumé...' });
}

async function handleGenerateTaxReminder(interaction: any): Promise<void> {
  await interaction.reply({ content: '⏳ Génération du rappel...' });
}
