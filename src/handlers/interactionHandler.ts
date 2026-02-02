import {
  Interaction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  MessageFlags,
} from 'discord.js';
import { logger } from '../utils/logger';
import { handleSetupCommand } from '../features/setup/setup.commands';
import { handleObjectivesCommand } from '../features/objectives/objectives.commands';
import { handleCompaniesCommand } from '../features/companies/companies.commands';
import { handleSalesCommand } from '../features/companies/sales.commands';
import { handleTaxesCommand } from '../features/taxes/taxes.commands';
import { handleMinistryCommand } from '../features/ministry/ministry.commands';
import { handleLeaderboardCommand } from '../features/leaderboard/leaderboard.commands';
import {
  handleObjectiveButton,
  handleObjectiveModal,
} from '../features/objectives/objectives.interactions';
import {
  handleSaleButton,
  handleSaleModal,
  handleSaleSelect,
} from '../features/companies/sales.interactions';
import { handleTaxButton, handleTaxRateModal, handlePayTaxesModal } from '../features/taxes/taxes.interactions';

export async function handleInteraction(interaction: Interaction): Promise<void> {
  try {
    // Commandes slash
    if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(interaction);
    }
    // Boutons
    else if (interaction.isButton()) {
      await handleButton(interaction);
    }
    // Modals
    else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    }
    // Menus select
    else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    }
  } catch (error) {
    logger.error("Erreur lors du traitement de l'interaction:", error);

    const errorMessage = "❌ Une erreur s'est produite lors du traitement de votre demande.";

    try {
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage });
        } else {
          await interaction.reply({ content: errorMessage });
        }
      }
    } catch (replyError) {
      logger.error("Erreur lors de l'envoi du message d'erreur:", replyError);
    }
  }
}

async function handleChatInputCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName } = interaction;

  switch (commandName) {
    case 'setup':
      await handleSetupCommand(interaction);
      break;
    case 'objectif':
      await handleObjectivesCommand(interaction);
      break;
    case 'entreprise':
      await handleCompaniesCommand(interaction);
      break;
    case 'vente':
      await handleSalesCommand(interaction);
      break;
    case 'impots':
      await handleTaxesCommand(interaction);
      break;
    case 'poste':
    case 'organigramme':
      await handleMinistryCommand(interaction);
      break;
    case 'classement':
      await handleLeaderboardCommand(interaction);
      break;
    default:
      await interaction.reply({
        content: '❌ Commande non reconnue.',
      });
  }
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  if (customId.startsWith('objective_')) {
    await handleObjectiveButton(interaction);
  } else if (customId.startsWith('sale_')) {
    await handleSaleButton(interaction);
  } else if (customId.startsWith('tax_')) {
    await handleTaxButton(interaction);
  } else {
    await interaction.reply({
      content: '❌ Bouton non reconnu.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const customId = interaction.customId;

  if (customId.startsWith('objective_') || customId.startsWith('criterion_') || customId.startsWith('contribution_')) {
    await handleObjectiveModal(interaction);
  } else if (customId.startsWith('sale_')) {
    await handleSaleModal(interaction);
  } else if (customId === 'tax_rate_modal') {
    await handleTaxRateModal(interaction);
  } else if (customId === 'pay_taxes_modal') {
    await handlePayTaxesModal(interaction);
  } else {
    await interaction.reply({
      content: '❌ Modal non reconnu.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const customId = interaction.customId;

  if (customId.startsWith('sale_')) {
    await handleSaleSelect(interaction);
  } else {
    await interaction.reply({
      content: '❌ Menu non reconnu.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
