// ============================================================
// Eʋegbe (Éwé) — traduction PROVISOIRE, à faire relire par un·e
// locuteur·rice natif·ve avant d'être présentée comme finalisée.
// `LOCALE_META.ee.ready` reste `false`.
//
// Couvert (ADR 0047, puis élargi module par module) : le vocabulaire
// d'interface de l'espace membre — navigation, actions, libellés de
// sections, boutons, états, champs de formulaire courts — pour :
// accueil, wallet, tontines, support, profil, connexion.
//
// PAS traduit ici (retombe automatiquement sur le Français, cf. lib/i18n)
// tant qu'un·e professionnel·le ne l'a pas fait/relu :
//   • statuts KYC, instructions de vérification d'identité ;
//   • prose juridique (CGU, confidentialité, mentions) ;
//   • mécanique financière détaillée (séquestre, contrat de tontine,
//     plafonds, calculs de versements) et messages d'erreur nuancés ;
//   • réponses de l'assistant IA ; back-office.
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
    soon: 'Nudɔwɔnu sia gbɔna kpuie.',
    seeAll: 'Kpɔ wo katã',
    next: 'Yi ŋgɔ',
    back: 'Trɔ',
    skip: 'To eŋu',
  },
  errors: {
    generic: 'Kuxi aɖe dzɔ.',
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
      phone: 'Kaɖiɖi ƒe xexlẽdzesi',
      password: 'Nyagbe ɣaɣla',
      forgot: 'Ŋlɔ nyagbe ɣaɣla be a?',
    },
    register: {
      title: 'Wɔ nye akɔnta',
      haveAccount: 'Akɔnta le asiwò xoxo?',
      signIn: 'Ge ɖe eme',
      firstName: 'Ŋkɔ',
      lastName: 'Ƒomeŋkɔ',
      phone: 'Kaɖiɖi ƒe xexlẽdzesi',
      password: 'Nyagbe ɣaɣla',
    },
    onboarding: {
      skip: 'To eŋu',
      next: 'Yi ŋgɔ',
      createAccount: 'Wɔ nye akɔnta',
      haveAccount: 'Akɔnta le asiwò xoxo?',
      signIn: 'Ge ɖe eme',
    },
    language: 'Gbe',
  },
  home: {
    greeting: 'Woezɔ',
    thisMonth: 'ɣleti sia',
    quickActions: 'Dɔwɔna kpuiwo',
    showServices: 'Kpɔ dɔwɔnawo katã',
    hideServices: 'Ŋe',
    forYou: 'Na wò',
    firstSteps: 'Afɔɖeɖe gbãtɔwo',
    recentActivity: 'Nu siwo va yi',
    myTontines: 'Nye Tontinewo',
    createTontine: 'Wɔ tontine yeye',
    totalBalance: 'Ga bliboa',
    showBalance: 'Ɖe ga la fia',
    hideBalance: 'Ɣla ga la',
    seeDetail: 'Kpɔ eme →',
    member: 'ame',
    members: 'amewo',
    round: 'Zɔzɔ {current}/{total}',
  },
  wallet: {
    title: 'Nye Gakotoku',
    send: 'Ɖo ɖa',
    receive: 'Xɔ',
    withdraw: 'Ɖe ɖa',
    history: 'Ŋlɔɖi',
    transactions: 'Gawɔwɔwo',
    filterAll: 'Katã',
    copy: 'Kɔpi',
    share: 'Mã',
    amount: 'Home',
  },
  tontine: {
    createShort: '+ Wɔ',
    createTitle: 'Wɔ tontine',
    joinTitle: 'Ge ɖe tontine me',
    join: 'Ge ɖe eme',
    see: 'Kpɔ →',
    pending: 'Le lalam',
    roundLabel: 'Zɔzɔ',
    fourTypes: 'Tontine ƒomevi eneawo',
    frequency: 'Zi nenie',
    startDate: 'Gɔmedzegbe',
    nameLabel: 'Tontine la ƒe ŋkɔ',
    membersLabel: 'Ame nenie',
    inviteCode: 'Amekpekpe ƒe kɔd',
  },
  support: {
    title: 'Kpekpeɖeŋu',
    subtitle: 'Aleke míate ŋu akpe ɖe ŋuwò?',
    contactUs: 'Ƒo ka na mí',
    openTicket: 'Ʋu biabia yeye',
    myTickets: 'Nye biabiawo',
    noTickets: 'Biabia aɖeke meʋu o. Nu sia nu le nyuie!',
    faq: 'Biabia siwo wobiana zi geɖe',
    category: 'Hatsotso',
    subject: 'Tanya',
    description: 'Numeɖeɖe',
    send: 'Ɖo ɖa',
    createTicket: 'Ʋu biabia la',
    status: {
      OPEN: 'Eʋu',
      IN_PROGRESS: 'Le edzi yim',
      WAITING: 'Le lalam',
      RESOLVED: 'Wokpɔ egbɔ',
      CLOSED: 'Wotui',
    },
    cat: {
      WALLET: 'Gakotoku',
      TONTINE: 'Tontine',
      BUSINESS: 'Asitsatsa',
      KYC: 'KYC',
      PAYMENT: 'Fexexe',
      ACCOUNT: 'Akɔnta',
      SECURITY: 'Dedienɔnɔ',
      OTHER: 'Bubuwo',
    },
  },
  profile: {
    language: 'Gbe kple Nuto',
    logout: 'Do go',
    kyc: 'KYC ƒe kpɔɖa',
    editPhoto: 'Trɔ foto',
    menu: {
      usertype: 'Ŋutinya ƒomevi',
      kyc: 'KYC ƒe kpɔɖa',
      locale: 'Gbe kple Nuto',
      theme: 'Dzedzeme',
      accent: 'Amadede',
      security: 'Dedienɔnɔ kple Nyagbe ɣaɣla',
      privacy: 'Wò ŋutɔ wò nyawo',
      trust: 'Gaɖoɖo kple asixɔxɔwo',
      support: 'Kpekpeɖeŋu',
      notifications: 'Gbeƒãɖeɖewo',
    },
    theme: {
      system: 'Eɖokui',
      light: 'Kekeli',
      dark: 'Viviti',
    },
  },
  pinLock: {
    unlock: 'Ʋui',
    wrong: 'Kɔd la mesɔ o.',
  },
};
