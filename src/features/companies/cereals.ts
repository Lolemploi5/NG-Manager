// Liste complète des céréales de Nations Glory avec leurs informations
export const CEREALS = [
  // Céréales terrestres - Toutes les zones
  {
    name: 'Blé',
    zone: 'Tous les continents',
    ogm: false
  },
  // Céréales terrestres - Zones limitées
  {
    name: 'Orge',
    zone: 'Amérique, Asie, Europe, Océanie',
    ogm: false
  },
  {
    name: 'Avoine',
    zone: 'Amérique, Europe, Océanie',
    ogm: false
  },
  {
    name: 'Soja',
    zone: 'Amérique, Asie',
    ogm: false
  },
  {
    name: 'Maïs',
    zone: 'Afrique, Amérique, Asie, Europe',
    ogm: false
  },
  {
    name: 'Seigle',
    zone: 'Asie, Europe',
    ogm: false
  },
  {
    name: 'Tournesol',
    zone: 'Afrique, Europe, Océanie',
    ogm: false
  },
  // OGM - Toutes les zones
  {
    name: 'Fonio (O.G.M)',
    zone: 'Tous les continents',
    ogm: true
  },
  {
    name: 'Sorgho (O.G.M)',
    zone: 'Tous les continents',
    ogm: true
  },
  {
    name: 'Kamut (O.G.M)',
    zone: 'Tous les continents',
    ogm: true
  },
  // Céréales Edora
  {
    name: 'Épaufre glacé',
    zone: 'Edora uniquement',
    ogm: false
  },
  {
    name: 'Avoine arctique',
    zone: 'Edora uniquement',
    ogm: false
  }
];

export function getCereal(name: string) {
  // Normaliser l'input pour accepter les variantes d'orthographe
  const normalized = name.toLowerCase()
    .replace(/mais(?!\s*\()/i, 'maïs'); // Remplace "mais" par "maïs" sauf s'il est suivi de "("
  
  return CEREALS.find(c => c.name.toLowerCase() === normalized);
}

export function getCerealChoices() {
  return CEREALS.map(c => ({
    name: c.ogm ? `🧬 ${c.name}` : `🌾 ${c.name}`,
    value: c.name
  }));
}
