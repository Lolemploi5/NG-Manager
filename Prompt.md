Tu es GitHub Copilot Edit. Crée un projet complet de bot Discord TypeScript nommé "NG Manager" pour Nation Glory.
Contrainte: 1 pays = 1 serveur Discord (1 guild). Le bot doit être réutilisable par n’importe quel pays sur son serveur.

Hébergement cible: Synology DS218play (ARMv8) avec Node.js v22 installé via Centre de paquets.
IMPORTANT:
- PAS de Docker requis (optionnel). Le déploiement doit fonctionner via SSH + PM2.
- Génère un script start.sh compatible DSM Task Scheduler (au démarrage).
- Tout doit fonctionner en “always-on” (process long-running).

Tech:
- discord.js v14.25.1
- Node.js >= 22.12 (sur NAS: v22.19 OK)
- TypeScript
- MongoDB Atlas (mongoose)
Langue UI: Français uniquement.

Mix UI Discord: Slash commands + boutons + modals.

========================================
1) STRUCTURE DU PROJET (TS + handlers)
========================================
Arborescence:
src/
  index.ts
  config/env.ts
  client/createClient.ts
  client/registerCommands.ts
  handlers/interactionHandler.ts
  db/connect.ts
  db/models/GuildConfig.ts
  db/models/Objective.ts
  db/models/Company.ts
  db/models/Sale.ts
  db/models/TaxRemittance.ts
  db/models/MinistryPost.ts
  db/models/ActivityEvent.ts
  features/setup/setup.commands.ts
  features/objectives/objectives.commands.ts
  features/objectives/objectives.service.ts
  features/companies/companies.commands.ts
  features/companies/sales.commands.ts
  features/companies/sales.service.ts
  features/taxes/taxes.commands.ts
  features/taxes/taxes.scheduler.ts
  features/ministry/ministry.commands.ts
  features/leaderboard/leaderboard.scheduler.ts
  web/health.ts
  utils/logger.ts
  utils/uuid.ts
  utils/format/money.ts
  utils/discord/permissions.ts
  utils/discord/roles.ts
  utils/discord/channel.ts

Fichiers racine:
- package.json (scripts dev/build/start, lint)
- tsconfig.json
- eslint + prettier
- .env.example
- README.md (déploiement NAS détaillé)
- start.sh (script de démarrage NAS)
- (optionnel) docker-compose.yml et Dockerfile, mais pas requis

========================================
2) CONFIG / ENV
========================================
.env:
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
MONGODB_URI=
NODE_ENV=development|production
DEV_GUILD_ID= (optionnel)
PORT=3000
DEFAULT_TAX_SERVER=0.00
DEFAULT_TAX_COUNTRY=0.05
DEFAULT_TAX_COMPANY=0.15

config/env.ts doit valider les variables et afficher des erreurs claires.

========================================
3) LANCEMENT + HEALTH ENDPOINT
========================================
- index.ts:
  - connect MongoDB
  - init client discord
  - register commands (guild-only si DEV_GUILD_ID en dev)
  - start scheduler impôts + classement
  - start mini serveur HTTP /health via web/health.ts sur PORT
- web/health.ts: GET /health -> 200 "ok" (utile monitoring)

========================================
4) ROLES + SETUP PAYS
========================================
Commande /setup:
Options:
- country_name (string)
- mode_roles: CREATE|MAP (défaut CREATE)
- enable_logs (boolean optionnel)
- enable_taxes_channel (boolean optionnel)
- taxes optionnels: serverTaxRate, countryTaxRate, defaultCompanyTaxRate
Actions:
- Créer ou mapper les rôles pays avec emojis dans le nom:
  - 👑 Chef
  - 🛡️ Officier
  - 👤 Membre
  - 🌱 Recrue
- Créer salons:
  - #objectifs (view tous, gestion Chef/Officiers)
  - #objectifs-validations (visible Chef/Officiers)
  - #impots (visible Chef/Officiers) si activé
  - #logs si activé
- Sauver GuildConfig en DB (idempotent)

GuildConfig:
- guildId unique
- countryName
- roles { chefRoleId, officerRoleId, memberRoleId, recruitRoleId }
- channels { objectivesChannelId, objectivesValidationChannelId, taxesChannelId?, logsChannelId? }
- taxes { serverTaxRate, countryTaxRate, defaultCompanyTaxRate }
- reminders { taxes: { enabled, mode DAYS|WEEKS|MONTHS, every:number } }
- createdAt/updatedAt

========================================
5) OBJECTIFS (avec validation contributions)
========================================
/objectif:
- creer (title, priority 1-5, category, deadline? optionnel)
- ajouter_critere (objectiveId, title, type BUILD|ITEM|LEVEL|OTHER, targetNumber? optionnel, unit? optionnel, notes? optionnel)
- liste (filters)
- voir (objectiveId)
- dashboard (message épinglé)

Contribuer:
- bouton [🤝 Contribuer] -> select criterion -> modal amount/message/proofUrl
- contribution créée en DB status=PENDING
- embed envoyé dans #objectifs-validations avec boutons [✅ Approuver] [❌ Refuser]
- seul Chef/Officier peut valider
- si approuvé: status=APPROVED + update embed objectif (progress)
- si refusé: status=REJECTED

========================================
6) ENTREPRISES + VENTES (taxes calcul)
========================================
/entreprise creer (name, type, emoji, taxCompanyRate?):
- crée catégorie "<emoji> <name>"
- salons: #ventes (lecture tous, écriture bot), #confirmations (PDG/Cadres + lecture Chef/Officiers)
- rôles entreprise avec emojis:
  - 💼 <name> - PDG
  - 🧩 <name> - Cadre
  - 🧑‍🌾 <name> - Employé
- taxCompanyRate par défaut:
  - si type == "Agricole" => 0.20
  - sinon => GuildConfig.taxes.defaultCompanyTaxRate

/vente soumettre (companyId, plante, recette, montant_brut):
Calcul IMPORTANT: “les autres taxes sont appliquées après la taxe serveur”
- serverTaxAmount = gross * serverTaxRate
- baseAfterServer = gross - serverTaxAmount
- companyTaxAmount = baseAfterServer * taxCompanyRate
- countryTaxAmount = baseAfterServer * countryTaxRate
- netToPay = gross - (serverTaxAmount + companyTaxAmount + countryTaxAmount)
Arrondir à 2 décimales.

Validation ventes:
- boutons [✅ Valider] [❌ Refuser] dans #confirmations
- permissions: PDG/Cadre uniquement (Chef/Officier NON)
- sur APPROVED:
  - poster un embed dans #ventes
  - stocker Sale.status=APPROVED
  - Sale.countryTaxPaid=false par défaut

========================================
7) IMPÔTS: rappel aux PDG/Cadres + validation + post dans #impots
========================================
Objectif:
- Notifier périodiquement PDG/Cadres de la taxe pays à payer (somme countryTaxAmount des ventes APPROVED non payées)
- fréquence configurable: nb de jours / semaines / mois
- quand la notification est “validée payée”: le bot poste un embed récap dans #impots visible Chef/Officiers

Commandes:
- /impots config (enabled, mode DAYS|WEEKS|MONTHS, every:number)
- /impots resume (companyId optionnel)
- /impots generer (companyId optionnel) -> force rappel maintenant

Rappel:
- embed mentionnant @PDG et @Cadres avec total dû + ventes incluses
- bouton [✅ Taxe pays payée] (cliquable PDG/Cadre)
Validation:
- marque les ventes incluses countryTaxPaid=true
- crée TaxRemittance record
- envoie embed récap dans #impots (Chef/Officiers)

Scheduler:
- Utiliser node-cron (ou alternative) et lire la config en DB.

========================================
8) MINISTÈRES / POSTES + ORGANIGRAMME
========================================
/poste creer (name, emoji optionnel)
 /poste assigner (posteId, user)
 /poste retirer (posteId, user)
/organigramme -> embed postes + titulaires

========================================
9) CLASSEMENT HEBDO
========================================
Log ActivityEvent:
- OBJECTIVE_CONTRIB_APPROVED -> 1 point
- SALE_APPROVED -> 2 points
Scheduler hebdo:
- poste top 10 dans un salon configurable
- /classement config (enabled, channelId)

========================================
10) README + DEPLOIEMENT NAS (OBLIGATOIRE)
========================================
Le README doit inclure un guide DS218play:
- Node v22 via Centre de paquets
- export PATH pour forcer v22: /var/packages/Node.js_v22/target/usr/local/bin
- déploiement:
  - npm ci
  - npm run build
  - npm i pm2
  - npx pm2 start dist/index.js --name ng-manager
  - npx pm2 save
- start.sh:
  - fixe PATH v22
  - cd projet
  - npx pm2 resurrect
  - npx pm2 start dist/index.js --name ng-manager --update-env
  - npx pm2 save
- DSM Task Scheduler “Au démarrage” qui lance start.sh
- logs: npx pm2 logs ng-manager
- update: git pull / rebuild / pm2 restart

========================================
11) LIVRABLE
========================================
Je veux un code compilable prêt à lancer, sans étapes manquantes.
