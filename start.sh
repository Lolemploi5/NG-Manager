#!/bin/bash

# Script de démarrage pour Synology DS218play
# À utiliser avec DSM Task Scheduler "Au démarrage"

# Forcer l'utilisation de Node.js v22 installé via Centre de paquets
export PATH="/var/packages/Node.js_v22/target/usr/local/bin:$PATH"

# Répertoire du projet (MODIFIER selon votre installation)
PROJECT_DIR="/volume1/docker/ng-manager"

# Aller dans le répertoire du projet
cd "$PROJECT_DIR" || exit 1

# Logger le démarrage
echo "[$(date)] Démarrage de NG Manager..." >> "$PROJECT_DIR/startup.log"

# Vérifier que Node.js est disponible
if ! command -v node &> /dev/null; then
    echo "[$(date)] ERREUR: Node.js non trouvé dans PATH" >> "$PROJECT_DIR/startup.log"
    exit 1
fi

# Afficher la version de Node.js utilisée
node --version >> "$PROJECT_DIR/startup.log"

# Ressusciter les processus PM2 sauvegardés (si existants)
npx pm2 resurrect >> "$PROJECT_DIR/startup.log" 2>&1

# Démarrer ou redémarrer l'application
npx pm2 start dist/index.js --name ng-manager --update-env >> "$PROJECT_DIR/startup.log" 2>&1

# Sauvegarder la liste des processus PM2
npx pm2 save >> "$PROJECT_DIR/startup.log" 2>&1

echo "[$(date)] NG Manager démarré avec succès" >> "$PROJECT_DIR/startup.log"

exit 0
