// ============================================================
// Eʋegbe (Éwé) — traduction PARTIELLE et PROVISOIRE.
//
// ⚠️ Ce fichier ne contient qu'un socle de vocabulaire de base.
// La traduction complète de l'interface — en particulier le
// vocabulaire financier, juridique et KYC — doit être réalisée /
// relue par un·e locuteur·rice natif·ve avant d'être présentée
// comme finalisée. `LOCALE_META.ee.ready` reste `false`.
//
// Toute clé absente ici retombe automatiquement sur le Français
// (voir lib/i18n).
// ============================================================
type Catalog = { [k: string]: string | Catalog };

export const ee: Catalog = {
  nav: {
    home: 'Aƒe',
    wallet: 'Gakotoku',
    tontines: 'Tontine',
    business: 'Asitsatsa',
    profile: 'Ŋutinya',
    explore: 'Dzro me',
    support: 'Kpekpeɖeŋu',
    myProfile: 'Nye ŋutinya',
    logout: 'Do go',
  },
  common: {
    retry: 'Gado agbagba',
    loading: 'Le tsↄtsↄm…',
    cancel: 'Ɖe asi le eŋu',
    confirm: 'Ɖo kpe edzi',
    save: 'Dzra ɖo',
    close: 'Tu',
    next: 'Yi ŋgↄ',
    back: 'Trↄ',
    skip: 'To eŋu',
  },
};
