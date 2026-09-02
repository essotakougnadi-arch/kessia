// ============================================================
// KESSIA — Commandes vocales de navigation (§34)
//
// PUR. À partir d'une phrase dictée (FR ou EN), reconnaît une
// intention de navigation (« va au wallet », « open my tontines »…)
// et renvoie la destination. Sinon null → la phrase est traitée
// comme une question pour KESSIA AI.
// ============================================================

export type VoiceCommand = { href: string; label: string };

const ROUTES: Array<{ href: string; label: string; keywords: string[] }> = [
  { href: '/home', label: 'Accueil', keywords: ['accueil', 'maison', 'page principale', 'home', 'main page', 'dashboard'] },
  { href: '/wallet', label: 'Wallet', keywords: ['wallet', 'portefeuille', 'mon solde', 'mon argent', 'mon compte', 'my balance', 'my money'] },
  { href: '/wallet?action=deposit', label: 'Recharger le wallet', keywords: ['recharger', 'deposer', 'faire un depot', 'ajouter de l argent', 'top up', 'deposit', 'add money'] },
  { href: '/wallet?action=send', label: 'Envoyer de l’argent', keywords: ['envoyer de l argent', 'faire un transfert', 'transferer', 'send money', 'make a transfer'] },
  { href: '/wallet?action=receive', label: 'Recevoir', keywords: ['recevoir', 'mon numero pour recevoir', 'mon qr code', 'receive money', 'my qr code'] },
  { href: '/tontine', label: 'Tontines', keywords: ['tontine', 'tontines', 'mes tontines', 'epargne collective', 'my tontines', 'group savings'] },
  { href: '/tontine?create=1', label: 'Créer une tontine', keywords: ['creer une tontine', 'nouvelle tontine', 'demarrer une tontine', 'create a tontine', 'new tontine'] },
  { href: '/tontine/garantie', label: 'Fonds de Garantie', keywords: ['fonds de garantie', 'garantie solidaire', 'guarantee fund'] },
  { href: '/business', label: 'Business', keywords: ['business', 'mon entreprise', 'mon activite', 'mon commerce', 'ma boutique', 'my business', 'my shop'] },
  { href: '/growth', label: 'Plan de croissance', keywords: ['plan de croissance', 'croissance', 'mes objectifs personnels', 'que faire', 'growth plan', 'my next steps'] },
  { href: '/simulator', label: 'Simulateurs', keywords: ['simulateur', 'simulateurs', 'simuler', 'faire une simulation', 'simulator', 'run a simulation'] },
  { href: '/calendar', label: 'Agenda', keywords: ['agenda', 'calendrier', 'mes echeances', 'mes rendez vous', 'calendar', 'my due dates', 'my schedule'] },
  { href: '/explore', label: 'Explorer', keywords: ['explorer', 'decouvrir', 'autres services', 'explore', 'discover', 'other modules'] },
  { href: '/ai', label: 'KESSIA AI', keywords: ['assistant', 'kessia ai', 'parler a l assistant', 'talk to the assistant', 'ask the ai'] },
  { href: '/profile/score', label: 'KESSIA Score', keywords: ['score', 'mon score', 'kessia score', 'ma fiabilite', 'my score', 'my trust score'] },
  { href: '/profile/kyc', label: 'Vérification KYC', keywords: ['kyc', 'verifier mon identite', 'verification d identite', 'verify my identity', 'identity check'] },
  { href: '/profile/security', label: 'Sécurité', keywords: ['securite', 'mot de passe', 'double authentification', 'security', 'password', 'two factor', 'sessions'] },
  { href: '/profile/notifications', label: 'Préférences de notification', keywords: ['preferences de notification', 'gerer mes notifications', 'notification settings', 'manage notifications'] },
  { href: '/profile/privacy', label: 'Confidentialité & données', keywords: ['confidentialite', 'mes donnees', 'exporter mes donnees', 'privacy', 'my data', 'export my data', 'delete my account'] },
  { href: '/trust', label: 'Transparence & tarifs', keywords: ['tarifs', 'frais', 'transparence', 'mes plafonds', 'fees', 'pricing', 'my limits'] },
  { href: '/notifications', label: 'Notifications', keywords: ['notifications', 'mes alertes', 'mes messages', 'my alerts', 'my notifications'] },
  { href: '/support', label: 'Support', keywords: ['support', 'aide', 'assistance', 'contacter le support', 'help', 'contact support', 'open a ticket'] },
  { href: '/profile', label: 'Profil', keywords: ['profil', 'mon profil', 'mes parametres', 'reglages', 'my profile', 'my settings'] },
];

const BACK_KEYWORDS = ['retour', 'reviens', 'page precedente', 'reculer', 'go back', 'back', 'previous page'];

const TRIGGERS = [
  'va', 'aller', 'ouvre', 'ouvrir', 'affiche', 'afficher', 'montre', 'montrer', 'navigue',
  'ouvre-moi', 'emmène-moi', 'emmene moi',
  'go', 'go to', 'open', 'show', 'show me', 'take me to', 'navigate to',
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchVoiceCommand(transcript: string): VoiceCommand | null {
  const n = normalize(transcript);
  if (!n) return null;

  const hasTrigger = TRIGGERS.some((t) => n.startsWith(normalize(t) + ' ') || n === normalize(t));
  // Sans verbe d'action explicite, on n'exige un mot-clé fort que si la phrase est courte.
  const short = n.split(' ').length <= 4;

  // Retour arrière : intention distincte.
  if (BACK_KEYWORDS.some((k) => n === normalize(k) || n.includes(normalize(k)))) {
    if (hasTrigger || short || n.split(' ').length <= 3) {
      return { href: 'back', label: 'Retour' };
    }
  }

  let best: { route: VoiceCommand; score: number } | null = null;
  for (const r of ROUTES) {
    for (const kw of r.keywords) {
      const k = normalize(kw);
      if (n.includes(k)) {
        const score = k.length + (hasTrigger ? 100 : 0);
        if (!best || score > best.score) best = { route: { href: r.href, label: r.label }, score };
      }
    }
  }

  if (!best) return null;
  if (hasTrigger || short) return best.route;
  return null;
}
