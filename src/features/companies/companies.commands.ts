import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import { Company } from '../../db/models/Company';
import { Sale } from '../../db/models/Sale';
import { logger } from '../../utils/logger';

export const companiesCommands = [
  new SlashCommandBuilder()
    .setName('entreprise')
    .setDescription('Gestion des entreprises')
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Créer une nouvelle entreprise')
    )
    .addSubcommand((sub) =>
      sub.setName('liste').setDescription('Lister toutes les entreprises')
    )
    .addSubcommand((sub) =>
      sub
        .setName('voir')
        .setDescription('Voir les détails d\'une entreprise')
        .addStringOption((opt) =>
          opt.setName('entreprise_id').setDescription('ID de l\'entreprise').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('vente-soumettre')
        .setDescription('Soumettre une vente pour une entreprise')
    )
    .addSubcommand((sub) =>
      sub
        .setName('vente-liste')
        .setDescription('Lister les ventes')
        .addStringOption((opt) =>
          opt.setName('entreprise_id').setDescription('Filtrer par entreprise').setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('status')
            .setDescription('Filtrer par statut')
            .setRequired(false)
            .addChoices(
              { name: 'En attente', value: 'PENDING' },
              { name: 'Approuvée', value: 'APPROVED' },
              { name: 'Rejetée', value: 'REJECTED' }
            )
        )
    )
];

export async function handleCompaniesCommand(interaction: any): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'creer':
      await handleCreateCompany(interaction);
      break;
    case 'liste':
      await handleListCompanies(interaction);
      break;
    case 'voir':
      await handleViewCompany(interaction);
      break;
    case 'vente-soumettre':
      await handleSubmitSale(interaction);
      break;
    case 'vente-liste':
      await handleListSales(interaction);
      break;
  }
}

async function handleCreateCompany(interaction: any): Promise<void> {
  try {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: '❌ Cette commande doit être utilisée sur un serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Afficher le modal de création d'entreprise
    const modal = createCompanyModal();
    await interaction.showModal(modal);
  } catch (error) {
    logger.error(`Erreur lors de l'affichage du modal entreprise: ${error}`);
    await interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire.', flags: MessageFlags.Ephemeral });
  }
}

async function handleListCompanies(interaction: any): Promise<void> {
  await interaction.deferReply();

  try {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('❌ Cette commande doit être utilisée sur un serveur.');
      return;
    }

    const companies = await Company.find({ guildId: guild.id });

    if (companies.length === 0) {
      await interaction.editReply('Aucune entreprise créée sur ce serveur.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle('📋 Entreprises du serveur')
      .setDescription(`Total: ${companies.length} entreprise(s)`)
      .addFields(
        companies.map((company) => ({
          name: `${company.emoji} ${company.name}`,
          value: `Type: ${company.type} | Taxe: ${(company.taxCompanyRate * 100).toFixed(1)}% | ID: \`${company.companyId}\``,
          inline: false,
        }))
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error(`Erreur lors de la liste des entreprises: ${error}`);
    await interaction.editReply('❌ Erreur lors du chargement des entreprises.');
  }
}

async function handleViewCompany(interaction: any): Promise<void> {
  await interaction.deferReply();

  try {
    const companyId = interaction.options.getString('entreprise_id', true);
    const company = await Company.findOne({ companyId });

    if (!company) {
      await interaction.editReply('❌ Entreprise non trouvée.');
      return;
    }

    if (company.guildId !== interaction.guild.id) {
      await interaction.editReply('❌ Cette entreprise n\'appartient pas à ce serveur.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`${company.emoji} ${company.name}`)
      .addFields(
        { name: 'Type', value: company.type, inline: true },
        { name: 'Taux de taxe', value: `${(company.taxCompanyRate * 100).toFixed(1)}%`, inline: true },
        { name: 'Catégorie', value: `<#${company.categoryId}>`, inline: false },
        { name: 'Channel Ventes', value: `<#${company.channels.salesChannelId}>`, inline: true },
        { name: 'Channel Confirmations', value: `<#${company.channels.confirmationsChannelId}>`, inline: true },
        { name: 'CEO', value: `<@&${company.roles.ceoRoleId}>`, inline: true },
        { name: 'Manager', value: `<@&${company.roles.managerRoleId}>`, inline: true },
        { name: 'Employé', value: `<@&${company.roles.employeeRoleId}>`, inline: true },
        { name: 'Créée par', value: `<@${company.createdBy}>`, inline: true }
      )
      .setFooter({ text: `ID: ${company.companyId}` })
      .setTimestamp(company.createdAt);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error(`Erreur lors de la lecture d'entreprise: ${error}`);
    await interaction.editReply('❌ Erreur lors du chargement des détails.');
  }
}

// Fonctions de gestion des ventes (anciennes de sales.commands.ts)
async function handleSubmitSale(interaction: any): Promise<void> {
  try {
    const guild = interaction.guild;
    const member = interaction.member;
    const channel = interaction.channel;
    
    if (!guild || !member || !channel) {
      await interaction.reply('❌ Cette commande doit être utilisée sur un serveur.');
      return;
    }

    // Déterminer le contexte : dans quel salon sommes-nous ?
    const allCompanies = await Company.find({ guildId: guild.id });
    let contextCompany = null;
    let userRole = null;

    // Vérifier si nous sommes dans un salon d'entreprise
    for (const company of allCompanies) {
      if (channel.id === company.channels.salesChannelId || 
          channel.id === company.channels.confirmationsChannelId ||
          channel.parentId === company.categoryId) {
        contextCompany = company;
        
        // Déterminer le rôle de l'utilisateur dans cette entreprise
        if (member.roles.cache.has(company.roles.ceoRoleId)) {
          userRole = 'CEO';
        } else if (member.roles.cache.has(company.roles.managerRoleId)) {
          userRole = 'Manager';
        } else if (member.roles.cache.has(company.roles.employeeRoleId)) {
          userRole = 'Employee';
        }
        break;
      }
    }

    // Si nous sommes dans un salon d'entreprise et que l'utilisateur a un rôle
    if (contextCompany && userRole) {
      return await handleDirectSubmission(interaction, contextCompany, userRole, channel);
    }

    // Sinon, refuser la commande
    await interaction.reply({
      content: '❌ Cette commande doit être utilisée dans un salon d\'entreprise (ventes ou confirmations).',
      flags: MessageFlags.Ephemeral
    });
    return;

  } catch (error) {
    logger.error(`Erreur lors de la soumission: ${error}`);
    await interaction.reply('❌ Erreur lors du chargement.');
  }
}

async function handleDirectSubmission(interaction: any, company: any, userRole: string, channel: any): Promise<void> {
  // Soumission directe dans le contexte d'une entreprise spécifique
  if (company.type === 'Build') {
    // Pour les entreprises Build, adapter selon le salon et le rôle
    if (channel.id === company.channels.confirmationsChannelId) {
      // Dans le salon confirmations, seuls CEO et Manager peuvent soumettre des contrats
      if (userRole !== 'CEO' && userRole !== 'Manager') {
        await interaction.reply({ 
          content: '❌ Seuls les CEO et Managers peuvent soumettre des contrats depuis le salon confirmations.',
          flags: MessageFlags.Ephemeral 
        });
        return;
      }
      
      // Modal spécialisé pour managers avec description obligatoire
      const modal = createManagerContractModal(company.companyId);
      await interaction.showModal(modal);
    } else {
      // Dans les autres salons de l'entreprise
      if (userRole === 'Employee') {
        await interaction.reply({ 
          content: `💡 En tant qu'employé, veuillez utiliser cette commande dans <#${company.channels.salesChannelId}> pour soumettre un contrat.`,
          flags: MessageFlags.Ephemeral 
        });
        return;
      }
      
      const modal = createContractModal(company.companyId);
      await interaction.showModal(modal);
    }
  } else {
    // Pour les entreprises Agricole, modal adapté selon le salon
    if (channel.id === company.channels.salesChannelId) {
      // Dans le salon ventes, modal rapide pour tous les employés
      const modal = createQuickSaleModal(company.companyId);
      await interaction.showModal(modal);
    } else if (channel.id === company.channels.confirmationsChannelId) {
      // Dans le salon confirmations, seuls CEO et Manager
      if (userRole !== 'CEO' && userRole !== 'Manager') {
        await interaction.reply({ 
          content: '❌ Seuls les CEO et Managers peuvent accéder au salon confirmations.',
          flags: MessageFlags.Ephemeral 
        });
        return;
      }
      
      const modal = createSaleModal(company.companyId);
      await interaction.showModal(modal);
    } else {
      // Dans autres salons de l'entreprise
      const modal = createSaleModal(company.companyId);
      await interaction.showModal(modal);
    }
  }
}

// Fonction de sélection d'entreprise supprimée — la commande est désormais contextuelle au salon
async function handleListSales(interaction: any): Promise<void> {
  await interaction.deferReply();

  try {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('❌ Cette commande doit être utilisée sur un serveur.');
      return;
    }

    let filter: any = { guildId: guild.id };

    const companyId = interaction.options.getString('entreprise_id');
    if (companyId) {
      filter.companyId = companyId;
    }

    const status = interaction.options.getString('status');
    if (status) {
      filter.status = status;
    }

    const sales = await Sale.find(filter).sort({ createdAt: -1 }).limit(10);

    if (sales.length === 0) {
      await interaction.editReply('❌ Aucune vente trouvée avec ces critères.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x00aa00)
      .setTitle('📦 Dernières ventes')
      .setDescription(`Total: ${sales.length} vente(s)`)
      .addFields(
        sales.map((sale) => ({
          name: `${sale.plant} - ${sale.grossAmount.toFixed(2)} 💰`,
          value: `Entreprise: ${sale.companyId} | Statut: ${
            sale.status === 'PENDING' ? '⏳ En attente' : sale.status === 'APPROVED' ? '✅ Approuvée' : '❌ Refusée'
          } | Montant net: ${sale.netAmount.toFixed(2)} 💰\nID: \`${sale.saleId}\``,
          inline: false,
        }))
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error(`Erreur lors de la liste des ventes: ${error}`);
    await interaction.editReply('❌ Erreur lors du chargement des ventes.');
  }
}

export function createSaleModal(companyId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`sale_modal_${companyId}`)
    .setTitle('Soumettre une vente')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('sale_plant')
          .setLabel('Choisir une céréale')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: Blé, Maïs, Kamut (O.G.M)...')
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(30)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('sale_amount')
          .setLabel('Montant de la vente')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 100.50')
          .setRequired(true)
      )
    );
}

export function createCompanyModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('create_company_modal')
    .setTitle('Créer une entreprise')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('company_name')
          .setLabel('Nom de l\'entreprise')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: Ferme du Soleil Levant')
          .setRequired(true)
          .setMaxLength(50)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('company_type')
          .setLabel('Type d\'entreprise')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Agricole, Build')
          .setRequired(true)
          .setMaxLength(20)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('company_emoji')
          .setLabel('Emoji représentatif (optionnel)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 🌾')
          .setRequired(false)
          .setMaxLength(2)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('company_tax_rate')
          .setLabel('Taux de taxe (0.00 à 1.00, optionnel)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 0.15')
          .setRequired(false)
          .setMaxLength(4)
      )
    );
}

export function createContractModal(companyId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`contract_modal_${companyId}`)
    .setTitle('Soumettre un contrat')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('contract_client')
          .setLabel('Client (Pays ou Joueur)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: France ou @NomJoueur')
          .setRequired(true)
          .setMaxLength(50)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('contract_amount')
          .setLabel('Montant du contrat')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 1000')
          .setRequired(true)
          .setMaxLength(10)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('contract_employees')
          .setLabel('Nombre d\'employés participants')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 3')
          .setRequired(true)
          .setMaxLength(3)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('contract_description')
          .setLabel('Description du contrat (optionnel)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Détails sur le contrat réalisé...')
          .setRequired(false)
          .setMaxLength(500)
      )
    );
}

export function createQuickSaleModal(companyId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`sale_modal_${companyId}`)
    .setTitle('Vente rapide')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('sale_plant')
          .setLabel('Céréale')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: Blé, Maïs, Orge...')
          .setRequired(true)
          .setMaxLength(20)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('sale_amount')
          .setLabel('Montant de la vente')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 500')
          .setRequired(true)
          .setMaxLength(10)
      )
    );
}

export function createManagerContractModal(companyId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`contract_modal_${companyId}`)
    .setTitle('Contrat (Manager)')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('contract_client')
          .setLabel('Client (Pays ou Joueur)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: France ou @NomJoueur')
          .setRequired(true)
          .setMaxLength(50)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('contract_amount')
          .setLabel('Montant du contrat')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 1000')
          .setRequired(true)
          .setMaxLength(10)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('contract_employees')
          .setLabel('Nombre d\'employés participants')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 3')
          .setRequired(true)
          .setMaxLength(3)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('contract_description')
          .setLabel('Description du contrat (obligatoire)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Détails complets sur le contrat réalisé pour validation...')
          .setRequired(true)
          .setMaxLength(500)
      )
    );
}
