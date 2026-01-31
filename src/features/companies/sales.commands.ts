import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { Company } from '../../db/models/Company';
import { Sale } from '../../db/models/Sale';
import { logger } from '../../utils/logger';

export const salesCommands = [
  new SlashCommandBuilder()
    .setName('vente')
    .setDescription('Gestion des ventes')
    .addSubcommand((sub) =>
      sub
        .setName('soumettre')
        .setDescription('Soumettre une vente')
    )
    .addSubcommand((sub) =>
      sub
        .setName('liste')
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
              { name: 'Approuvées', value: 'APPROVED' },
              { name: 'Refusées', value: 'REJECTED' }
            )
        )
    ),
];

export async function handleSalesCommand(interaction: any): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'soumettre':
      await handleSubmitSale(interaction);
      break;
    case 'liste':
      await handleListSales(interaction);
      break;
  }
}

async function handleSubmitSale(interaction: any): Promise<void> {
  try {
    const guild = interaction.guild;
    const member = interaction.member;
    
    if (!guild || !member) {
      await interaction.reply('❌ Cette commande doit être utilisée sur un serveur.');
      return;
    }

    // Récupérer toutes les entreprises agricoles du serveur
    const allCompanies = await Company.find({ guildId: guild.id, type: 'Agricole' });

    if (allCompanies.length === 0) {
      await interaction.reply('❌ Aucune entreprise agricole créée sur ce serveur.');
      return;
    }

    // Filtrer les entreprises où l'utilisateur a un rôle (CEO, Manager ou Employee)
    const userCompanies = allCompanies.filter(company => {
      const hasRole = member.roles.cache.has(company.roles.ceoRoleId) ||
                      member.roles.cache.has(company.roles.managerRoleId) ||
                      member.roles.cache.has(company.roles.employeeRoleId);
      return hasRole;
    });

    if (userCompanies.length === 0) {
      await interaction.reply('❌ Vous devez avoir un rôle dans une entreprise agricole pour soumettre une vente.');
      return;
    }

    // Si l'utilisateur a un seul rôle d'entreprise, montrer directement le modal
    if (userCompanies.length === 1) {
      const modal = createSaleModal(userCompanies[0].companyId);
      await interaction.showModal(modal);
      return;
    }

    // Si plusieurs entreprises, créer un select menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('sale_company_select')
      .setPlaceholder('Choisir une entreprise')
      .addOptions(
        userCompanies.map((company) => ({
          label: `${company.emoji} ${company.name}`,
          value: company.companyId,
          description: `Type: ${company.type}`,
        }))
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await interaction.reply({
      content: '📦 Sélectionne une entreprise pour soumettre une vente:',
      components: [row],
    });
  } catch (error) {
    logger.error(`Erreur lors de la soumission de vente: ${error}`);
    await interaction.reply('❌ Erreur lors du chargement des entreprises.');
  }
}

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
