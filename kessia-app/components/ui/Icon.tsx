// ============================================================
// KESSIA — Jeu d'icônes (Lucide, trait fin monochrome)
// Un seul registre nom → composant : les écrans réfèrent une
// icône par son nom sémantique, jamais directement Lucide.
// Les icônes héritent `currentColor` (teinte = couleur du texte
// parent) et un fond pastel éventuel reste géré par le CSS appelant.
// ============================================================

import type { CSSProperties } from 'react';
import {
  ArrowDownLeft,
  Banknote,
  Bell,
  Calculator,
  CalendarDays,
  Compass,
  CreditCard,
  Gauge,
  Landmark,
  LifeBuoy,
  Link2,
  LogOut,
  type LucideIcon,
  Repeat,
  Send,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Sprout,
  Star,
  Store,
  Target,
  TrendingUp,
  User,
  Wallet,
  Home,
  QrCode,
} from 'lucide-react';

const REGISTRY = {
  // Navigation
  home: Home,
  wallet: Wallet,
  tontines: Repeat,
  business: Store,
  profile: User,
  marketplace: ShoppingBag,
  explore: Compass,
  support: LifeBuoy,
  logout: LogOut,
  ai: Sparkles,
  // Actions wallet
  send: Send,
  receive: ArrowDownLeft,
  topup: CreditCard,
  withdraw: Landmark,
  airtime: Smartphone,
  savings: Banknote,
  // Services / raccourcis accueil
  score: Gauge,
  growth: Sprout,
  calendar: CalendarDays,
  simulator: Calculator,
  // Divers
  bell: Bell,
  shield: ShieldCheck,
  star: Star,
  qr: QrCode,
  link: Link2,
  // Types de tontine
  'tontine-rotating': Repeat,
  'tontine-project': Target,
  'tontine-growth': TrendingUp,
  'tontine-purchase': ShoppingCart,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof REGISTRY;

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.75,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const Glyph = REGISTRY[name];
  return <Glyph size={size} strokeWidth={strokeWidth} className={className} style={style} aria-hidden />;
}
