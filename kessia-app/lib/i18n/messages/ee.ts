// ============================================================
// Eʋegbe (Éwé) — traduction PARTIELLE et PROVISOIRE.
//
// ⚠️ Périmètre couvert (ADR 0047) : le « chrome » de l'interface —
// navigation, actions génériques (enregistrer / annuler / fermer…),
// fréquences, quelques libellés courts de l'espace membre. Tout le
// reste — vocabulaire financier, juridique, KYC, prose serveur,
// back-office — retombe AUTOMATIQUEMENT sur le Français (voir lib/i18n).
//
// La traduction complète et sa relecture par un·e locuteur·rice
// natif·ve (en particulier les termes financiers et juridiques) restent
// à faire AVANT de présenter l'éwé comme finalisé.
// `LOCALE_META.ee.ready` reste donc `false`.
//
// Orthographe : standard Eʋegbe — ɖ ƒ ŋ ɔ ɛ ʋ.
// ============================================================
type Catalog = { [k: string]: string | Catalog };

export const ee: Catalog = {
  nav: {
    home: 'Aƒe',
    wallet: 'Gakotoku',
    tontines: 'Tontine',
    business: 'Asitsatsa',
    marketplace: 'Asime',
    profile: 'Ŋutinya',
    explore: 'Dzro me',
    support: 'Kpekpeɖeŋu',
    notifications: 'Gbeƒãɖeɖewo',
    myProfile: 'Nye ŋutinya',
    section: 'Vevitɔ',
    logout: 'Do go',
    aiAsk: 'Bia KESSIA AI',
    aiLabel: 'KESSIA AI',
  },
  common: {
    retry: 'Gado agbagba',
    loading: 'Lala vie…',
    cancel: 'Ɖe asi le eŋu',
    confirm: 'Ɖo kpe edzi',
    save: 'Dzra ɖo',
    close: 'Tu',
    seeAll: 'Kpɔ wo katã',
    next: 'Yi ŋgɔ',
    back: 'Trɔ',
    skip: 'To eŋu',
  },
  freq: {
    WEEKLY: 'Kwasiɖa sia kwasiɖa',
    BIWEEKLY: 'Kwasiɖa eve sia eve',
    MONTHLY: 'Ɣleti sia ɣleti',
  },
  format: {
    freq: {
      WEEKLY: 'Kwasiɖa sia kwasiɖa',
      BIWEEKLY: 'Kwasiɖa eve sia eve',
      MONTHLY: 'Ɣleti sia ɣleti',
    },
  },
  auth: {
    login: {
      title: 'Ge ɖe eme',
      submit: 'Ge ɖe eme →',
      noAccount: 'Akɔnta mele asiwò haɖe oa?',
      createAccount: 'Wɔ akɔnta femaxee',
    },
    register: {
      haveAccount: 'Akɔnta le asiwò xoxo?',
      signIn: 'Ge ɖe eme',
    },
    onboarding: {
      skip: 'To eŋu',
      next: 'Yi ŋgɔ',
      signIn: 'Ge ɖe eme',
      haveAccount: 'Akɔnta le asiwò xoxo?',
    },
    language: 'Gbe',
  },
  home: {
    greeting: 'Woezɔ',
    thisMonth: 'ɣleti sia',
    recentActivity: 'Nu siwo va yi',
    myTontines: 'Nye Tontinewo',
    createTontine: 'Wɔ tontine yeye',
  },
  pinLock: {
    unlock: 'Ʋui',
    wrong: 'Kɔd la mesɔ o.',
  },
};
