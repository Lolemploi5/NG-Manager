# NG Manager

Bot Discord de gestion pour Nation Glory - Un bot complet pour gérer les pays, objectifs, entreprises, ventes, impôts et classements.

## 📋 Prérequis

- Node.js >= 22.12
- MongoDB Atlas (compte gratuit)
- Un bot Discord (avec token et client ID)
- Un serveur Discord pour tester

## 🚀 Installation Locale

### 1. Cloner le projet

```bash
git clone <votre-repo>
cd "NG Manager"
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Configuration

Copier `.env.example` vers `.env` et remplir les variables:

```bash
cp .env.example .env
```

Éditer `.env`:
```env
DISCORD_TOKEN=votre_token_discord
DISCORD_CLIENT_ID=votre_client_id
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/ng-manager
NODE_ENV=development
DEV_GUILD_ID=id_serveur_test  # Optionnel pour le dev
PORT=3000
DEFAULT_TAX_SERVER=0.00
DEFAULT_TAX_COUNTRY=0.05
DEFAULT_TAX_COMPANY=0.15
```

### 4. Lancer en développement

```bash
npm run dev
```

### 5. Build pour production

```bash
npm run build
npm start
```

## 🏭 Déploiement sur Synology DS218play

### Prérequis Synology

1. **Installer Node.js v22** via le Centre de paquets DSM
2. **Accès SSH** activé (Panneau de configuration > Terminal & SNMP)
3. **Git installé** (optionnel mais recommandé)

### Étapes de déploiement

#### 1. Connexion SSH

```bash
ssh admin@votre-nas-ip
```

#### 2. Configurer le PATH pour Node.js v22

Le Node.js installé via Centre de paquets se trouve dans `/var/packages/Node.js_v22/target/usr/local/bin`.

Ajouter à votre `.profile` ou `.bashrc`:

```bash
export PATH="/var/packages/Node.js_v22/target/usr/local/bin:$PATH"
```

Recharger:
```bash
source ~/.profile
```

Vérifier:
```bash
node --version  # Devrait afficher v22.x
npm --version
```

#### 3. Créer le répertoire du projet

```bash
mkdir -p /volume1/docker/ng-manager
cd /volume1/docker/ng-manager
```

#### 4. Cloner ou uploader le projet

**Option A: Via Git**
```bash
git clone <votre-repo> .
```

**Option B: Via SCP depuis votre machine locale**
```bash
scp -r /chemin/local/NG\ Manager/* admin@nas-ip:/volume1/docker/ng-manager/
```

#### 5. Installer les dépendances

```bash
cd /volume1/docker/ng-manager
npm ci --production
```

#### 6. Configuration .env

```bash
cp .env.example .env
nano .env
```

Remplir les variables (pas de `DEV_GUILD_ID` en production):
```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
MONGODB_URI=...
NODE_ENV=production
PORT=3000
DEFAULT_TAX_SERVER=0.00
DEFAULT_TAX_COUNTRY=0.05
DEFAULT_TAX_COMPANY=0.15
```

#### 7. Build du projet

```bash
npm run build
```

#### 8. Installer PM2

```bash
npm install pm2
```

#### 9. Démarrer avec PM2

```bash
npx pm2 start dist/index.js --name ng-manager
npx pm2 save
```

Vérifier:
```bash
npx pm2 status
npx pm2 logs ng-manager
```

#### 10. Configurer le démarrage automatique avec DSM Task Scheduler

Le fichier `start.sh` est déjà fourni. **Modifier le chemin du projet** dans `start.sh`:

```bash
nano start.sh
```

Modifier la ligne:
```bash
PROJECT_DIR="/volume1/docker/ng-manager"  # Adapter selon votre installation
```

Rendre le script exécutable:
```bash
chmod +x start.sh
```

**Configuration DSM Task Scheduler:**

1. Ouvrir **Panneau de configuration** > **Planificateur de tâches**
2. Créer > **Tâche planifiée** > **Script défini par l'utilisateur**
3. **Général:**
   - Nom: `NG Manager Startup`
   - Utilisateur: `root` (ou votre utilisateur admin)
   - Événement: **Au démarrage**
4. **Paramètres de la tâche:**
   - Script défini par l'utilisateur:
     ```bash
     /volume1/docker/ng-manager/start.sh
     ```
5. Enregistrer

**Tester le script manuellement:**
```bash
sudo /volume1/docker/ng-manager/start.sh
```

Vérifier les logs:
```bash
cat /volume1/docker/ng-manager/startup.log
npx pm2 logs ng-manager
```

## 📊 Commandes du Bot

### Configuration initiale

```
/setup
  country_name: Nom du pays
  mode_roles: CREATE (créer) ou MAP (mapper existants)
  enable_logs: true/false
  enable_taxes_channel: true/false
  server_tax_rate: 0.00 (optionnel)
  country_tax_rate: 0.05 (optionnel)
  default_company_tax_rate: 0.15 (optionnel)
```

### Objectifs

```
/objectif creer
/objectif ajouter_critere
/objectif liste
/objectif voir
/objectif dashboard
```

### Entreprises

```
/entreprise creer
/entreprise liste
/entreprise voir
```

### Ventes

```
/vente soumettre
/vente liste
```

### Impôts

```
/impots config
/impots resume
/impots generer
```

### Ministères

```
/poste creer
/poste assigner
/poste retirer
/poste liste
/organigramme
```

### Classement

```
/classement config
/classement afficher
```

## 🔧 Maintenance

### Voir les logs PM2

```bash
npx pm2 logs ng-manager
npx pm2 logs ng-manager --lines 100
```

### Redémarrer le bot

```bash
npx pm2 restart ng-manager
```

### Arrêter le bot

```bash
npx pm2 stop ng-manager
```

### Mettre à jour le bot

```bash
cd /volume1/docker/ng-manager
git pull  # ou upload des nouveaux fichiers
npm ci --production
npm run build
npx pm2 restart ng-manager
```

### Monitoring

Le bot expose un endpoint de health check:
```bash
curl http://localhost:3000/health
```

Réponse:
```json
{"status":"ok","timestamp":"2026-01-29T..."}
```

## 🏗️ Architecture

```
src/
├── index.ts                    # Point d'entrée
├── config/
│   └── env.ts                  # Configuration environnement
├── client/
│   ├── createClient.ts         # Création client Discord
│   └── registerCommands.ts     # Enregistrement commandes
├── handlers/
│   └── interactionHandler.ts   # Routeur d'interactions
├── db/
│   ├── connect.ts              # Connexion MongoDB
│   └── models/                 # Modèles Mongoose
├── features/
│   ├── setup/                  # Configuration serveur
│   ├── objectives/             # Gestion objectifs
│   ├── companies/              # Gestion entreprises
│   ├── taxes/                  # Gestion impôts
│   ├── ministry/               # Gestion ministères
│   └── leaderboard/            # Classement
├── web/
│   └── health.ts               # Health check endpoint
└── utils/                      # Utilitaires
```

## 📝 Calcul des Taxes

Le calcul suit la logique: **"les autres taxes sont appliquées après la taxe serveur"**

```
serverTaxAmount = gross × serverTaxRate
baseAfterServer = gross - serverTaxAmount
companyTaxAmount = baseAfterServer × companyTaxRate
countryTaxAmount = baseAfterServer × countryTaxRate
netAmount = gross - (serverTaxAmount + companyTaxAmount + countryTaxAmount)
```

Tous les montants sont arrondis à 2 décimales.

## 🎯 Points d'Activité

- Contribution à un objectif approuvée: **1 point**
- Vente approuvée: **2 points**

Le classement hebdomadaire affiche le top 10 des membres les plus actifs.

## 🐛 Dépannage

### Le bot ne démarre pas

1. Vérifier les variables d'environnement dans `.env`
2. Vérifier la connexion MongoDB:
   ```bash
   node -e "require('mongoose').connect('votre_uri').then(() => console.log('OK'))"
   ```
3. Vérifier les logs:
   ```bash
   npx pm2 logs ng-manager --err
   ```

### Les commandes n'apparaissent pas

- En dev: vérifier que `DEV_GUILD_ID` est défini
- En prod: les commandes globales peuvent prendre jusqu'à 1h pour se propager
- Forcer le refresh: quitter et rejoindre le serveur Discord

### Permission denied sur start.sh

```bash
chmod +x /volume1/docker/ng-manager/start.sh
```

### Node.js v22 non trouvé

Vérifier le PATH dans `start.sh`:
```bash
export PATH="/var/packages/Node.js_v22/target/usr/local/bin:$PATH"
```

## 📄 Licence

MIT

## 👥 Support

Pour toute question ou problème, consultez les logs et la documentation Discord.js v14.
