// ============================================================
// KESSIA — Couleur d'accent par icône
//
// Chaque icône du registre a une teinte sémantique. Rendu :
//   <Icon name="wallet" tinted />        → trait en `iconColor('wallet')`
//   `${iconColor(name)}1F`               → fond pastel assorti
// Palette choisie pour tenir sur fond blanc ET sur la carte
// de solde en dégradé terracotta.
// ============================================================

import type { IconName } from '@/components/ui/Icon';

const TERRACOTTA = '#C2410C';
const BLUE = '#2563EB';
const GREEN = '#15803D';
const AMBER = '#D97706';
const VIOLET = '#7C3AED';
const TEAL = '#0D9488';
const ROSE = '#E11D48';
const SLATE = '#475569';

export const ICON_COLOR: Record<IconName, string> = {
  home: TERRACOTTA,
  wallet: BLUE,
  tontines: GREEN,
  business: AMBER,
  profile: SLATE,
  marketplace: VIOLET,
  explore: TEAL,
  support: TEAL,
  logout: ROSE,
  ai: VIOLET,
  dashboard: SLATE,
  send: BLUE,
  receive: GREEN,
  topup: AMBER,
  withdraw: SLATE,
  airtime: TEAL,
  mobile: TEAL,
  savings: GREEN,
  add: GREEN,
  link: TEAL,
  score: TERRACOTTA,
  growth: GREEN,
  calendar: BLUE,
  simulator: VIOLET,
  chart: BLUE,
  bell: TERRACOTTA,
  shield: GREEN,
  'shield-alert': ROSE,
  star: AMBER,
  qr: SLATE,
  lock: SLATE,
  languages: BLUE,
  palette: VIOLET,
  scale: TEAL,
  message: BLUE,
  mic: TERRACOTTA,
  phone: GREEN,
  mail: BLUE,
  globe: TERRACOTTA,
  gift: ROSE,
  clock: AMBER,
  'alarm-clock': ROSE,
  check: GREEN,
  cross: ROSE,
  document: SLATE,
  receipt: AMBER,
  package: AMBER,
  target: ROSE,
  trophy: AMBER,
  celebrate: VIOLET,
  wave: TERRACOTTA,
  rocket: VIOLET,
  handshake: AMBER,
  'trending-up': GREEN,
  'trending-down': ROSE,
  'user-type': SLATE,
  building: SLATE,
  institution: SLATE,
  learn: GREEN,
  community: BLUE,
  jobs: VIOLET,
  invest: GREEN,
  insurance: AMBER,
  diaspora: TERRACOTTA,
  loans: GREEN,
  trust: TEAL,
  'tontine-rotating': TERRACOTTA,
  'tontine-project': GREEN,
  'tontine-growth': AMBER,
  'tontine-purchase': VIOLET,
  tag: AMBER,
  laptop: BLUE,
  agri: GREEN,
  craft: VIOLET,
  commerce: AMBER,
  food: ROSE,
  health: TEAL,
  hospital: ROSE,
  education: BLUE,
  water: BLUE,
  moto: SLATE,
  house: TERRACOTTA,
  office: SLATE,
  poultry: AMBER,
  marketing: VIOLET,
  ledger: SLATE,
  urgent: ROSE,
  heart: ROSE,
  video: BLUE,
  family: TERRACOTTA,
};

export function iconColor(name: IconName): string {
  return ICON_COLOR[name] ?? TERRACOTTA;
}
