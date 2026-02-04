# NG Manager - Instructions pour agents IA

NG Manager est un bot Discord TypeScript pour gérer un jeu de rôle Nation Glory avec des entreprises, objectifs, ventes et systèmes fiscaux.

## Architecture

**Structure en features modulaires** : Chaque fonctionnalité vit dans `/src/features/` avec pattern `*.commands.ts`, `*.interactions.ts`, `*.service.ts`, `*.scheduler.ts`

**Modèles MongoDB centralisés** : `/src/db/models/` définit les schémas Mongoose avec interfaces TypeScript typées

**Routage d'interactions unifié** : [`interactionHandler.ts`](src/handlers/interactionHandler.ts) dispatche toutes les interactions Discord vers les handlers appropriés

## Patterns spécifiques au projet

### Commandes Discord
- Utilise SlashCommandBuilder avec sous-commandes organisées par feature
- Exemple : `/entreprise creer|liste|voir` dans [`companies.commands.ts`](src/features/companies/companies.commands.ts)
- Validation stricte avec `.setRequired(true)` et choix énumérés

### Structure des objectifs
- **3 salons organisés** : setup créé automatiquement une catégorie "📋 OBJECTIFS" avec :
  - `new-objectifs` : Nouveaux objectifs créés (où apparaissent les objectifs fraîchement créés)
  - `objectifs` : Objectifs en cours/terminés  
  - `objectifs-validations` : Validation des contributions (Chef/Officier uniquement)
- **Permissions hiérarchique** : chef > officer > member > recruit dans [`GuildConfig`](src/db/models/GuildConfig.ts)
- Validation stricte avec [`checkPermissions`](src/utils/discord/permissions.ts) avant actions sensibles
- Création automatique de rôles/channels lors de setup initial

### Interface interactive des objectifs
- **Menu déroulant** pour sélectionner objectifs sans connaître les IDs
- **Navigation paginer** avec boutons Précédent/Suivant (5 objectifs par page)
- **Sélection directe** : clic sur objectif = affichage détail automatique
- Émojis priorité : ⚠️🔴🟡🟢⚪ pour identification visuelle rapide

### Identifiants uniques
- Génération via [`generateShortId()`](src/utils/uuid.ts) pour objectiveId, companyId, criterionId
- Pattern : `OBJ-XXXXX`, `COM-XXXXX` pour lisibilité utilisateur

### Services métier
- Classes statiques avec méthodes async : `ObjectivesService.createObjective()`
- Logique métier séparée des commandes Discord
- Exemple : [`objectives.service.ts`](src/features/objectives/objectives.service.ts)

## Workflows critiques

### Développement
```bash
npm run dev        # Watch mode avec tsx
npm run build      # TypeScript vers dist/
npm start          # Production depuis dist/
```

### Configuration du serveur
```bash
/setup init        # Configuration initiale (rôles, salons, catégorie)
/setup reset       # ⚠️ SUPPRESSION COMPLÈTE (salons, rôles, toutes les données)
```

### Structure des interactions
1. **Command** : Parse arguments, valide permissions
2. **Service** : Logique métier, manipulation DB  
3. **Interaction** : Handlers pour boutons/modals/selects
4. **Scheduler** : Tâches automatisées (impôts, classements)

### Variables d'environnement essentielles
- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` : Bot Discord
- `MONGODB_URI` : Base de données
- `DEV_GUILD_ID` : Serveur de test (optionnel)
- Taux d'imposition : `DEFAULT_TAX_*` dans [`env.ts`](src/config/env.ts)

## Conventions de code

- **Logging centralisé** : [`logger.ts`](src/utils/logger.ts) pour toutes les opérations
- **Formatage monétaire** : [`money.ts`](src/utils/format/money.ts) avec devise personnalisée
- **Embeds Discord** : EmbedBuilder avec couleurs cohérentes par type d'action
- **Gestion d'erreurs** : Try-catch avec réponses gracieuses aux utilisateurs

## Points d'intégration

- **MongoDB** : Connexion persistante via [`connect.ts`](src/db/connect.ts)
- **Health checks** : Serveur Express minimal dans [`health.ts`](src/web/health.ts) pour monitoring
- **Schedulers** : node-cron pour tâches automatisées (impôts hebdomadaires, classements)
- **Client Discord global** : Exporté depuis [`index.ts`](src/index.ts) pour accès aux schedulers

Quand tu ajoutes une nouvelle feature, créé le dossier dans `/features/` avec les 4 fichiers pattern et ajoute les routes dans [`interactionHandler.ts`](src/handlers/interactionHandler.ts).