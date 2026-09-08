// ============================================================
// KESSIA — Jeu d'icônes (Lucide, trait fin monochrome)
// Un seul registre nom → composant : les écrans réfèrent une
// icône par son nom sémantique, jamais directement Lucide.
// Les icônes héritent `currentColor` (teinte = couleur du texte
// parent) et un fond pastel éventuel reste géré par le CSS appelant.
// ============================================================

import type { CSSProperties } from 'react';
import { iconColor } from '@/lib/ui/icon-colors';
import {
  AlarmClock,
  ArrowDownLeft,
  Banknote,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Clock,
  Compass,
  CreditCard,
  FileText,
  Gauge,
  Gift,
  Globe,
  GraduationCap,
  Hand,
  HandHeart,
  Handshake,
  Home,
  Landmark,
  Languages,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  Lock,
  LogOut,
  type LucideIcon,
  Mail,
  MessageCircle,
  Mic,
  Package,
  Palette,
  PartyPopper,
  Phone,
  Plus,
  QrCode,
  Receipt,
  Repeat,
  Rocket,
  Scale,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Sprout,
  Star,
  Store,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  User,
  UserCog,
  Users,
  Wallet,
  XCircle,
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
  dashboard: LayoutDashboard,
  // Actions
  send: Send,
  receive: ArrowDownLeft,
  topup: CreditCard,
  withdraw: Landmark,
  airtime: Smartphone,
  mobile: Smartphone,
  savings: Banknote,
  add: Plus,
  link: Link2,
  // Services / raccourcis
  score: Gauge,
  growth: Sprout,
  calendar: CalendarDays,
  simulator: Calculator,
  chart: BarChart3,
  // Divers
  bell: Bell,
  shield: ShieldCheck,
  'shield-alert': ShieldAlert,
  star: Star,
  qr: QrCode,
  lock: Lock,
  languages: Languages,
  palette: Palette,
  scale: Scale,
  message: MessageCircle,
  mic: Mic,
  phone: Phone,
  mail: Mail,
  globe: Globe,
  gift: Gift,
  clock: Clock,
  'alarm-clock': AlarmClock,
  check: CheckCircle2,
  cross: XCircle,
  document: FileText,
  receipt: Receipt,
  package: Package,
  target: Target,
  trophy: Trophy,
  celebrate: PartyPopper,
  wave: Hand,
  rocket: Rocket,
  handshake: Handshake,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  'user-type': UserCog,
  building: Building2,
  institution: Landmark,
  // Modules
  learn: GraduationCap,
  community: Users,
  jobs: Briefcase,
  invest: TrendingUp,
  insurance: ShieldCheck,
  diaspora: Globe,
  loans: HandHeart,
  trust: Scale,
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
  tinted = false,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  /** applique la couleur d'accent sémantique de l'icône (sinon héritée) */
  tinted?: boolean;
}) {
  const Glyph = REGISTRY[name];
  const resolved = tinted ? { color: iconColor(name), ...style } : style;
  return <Glyph size={size} strokeWidth={strokeWidth} className={className} style={resolved} aria-hidden />;
}

/** Couleur d'accent d'une icône — pour teinter un fond/chip côté appelant. */
export { iconColor } from '@/lib/ui/icon-colors';
