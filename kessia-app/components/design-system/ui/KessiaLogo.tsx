// ============================================================
// KESSIA — Logo
//   • variant "full"   → lockup couleur officiel /public/logo/kessia-logo-color*.png (fonds clairs)
//   • variant "white"  → lockup blanc officiel   /public/logo/kessia-logo-white*.png (fonds sombres)
//   • variant "symbol" → symbole K seul (SVG)
// Le symbole SVG et l'icône mobile restent codés (petites tailles, favicon…).
// ============================================================

interface KessiaLogoProps {
  variant?: 'full' | 'symbol' | 'white';
  size?: number;
  showTagline?: boolean;
  className?: string;
}

const ORANGE = '#B65A3A';
const GOLD   = '#D6A84F';
const GREEN  = '#1F5D4A';

// ─────────────────────────────────────────────────────────────
// Lockups officiels (PNG transparents, dérivés de
// public/images/logo2Kessia.png [couleur] et LOGO KESSIA.png [blanc]).
//   *-color / *-white       → symbole + « KESSIA » (sans tagline)
//   *-color-full / *-white-full → + « Épargner… / Grandir ensemble »
// ─────────────────────────────────────────────────────────────
const COLOR_SRC        = '/logo/kessia-logo-color.png';       // 748 × 260
const COLOR_SRC_FULL   = '/logo/kessia-logo-color-full.png';  // 770 × 260
const COLOR_RATIO      = 748 / 260;
const COLOR_FULL_RATIO = 770 / 260;
const WHITE_SRC        = '/logo/kessia-logo-white.png';       // 1232 × 439
const WHITE_SRC_FULL   = '/logo/kessia-logo-white-full.png';  // 1242 × 443
const WHITE_RATIO      = 1232 / 439;
const WHITE_FULL_RATIO = 1242 / 443;

function KessiaLogoImage({
  height,
  showTagline = false,
  className = '',
}: {
  height: number;
  showTagline?: boolean;
  className?: string;
}) {
  const src   = showTagline ? COLOR_SRC_FULL : COLOR_SRC;
  const ratio = showTagline ? COLOR_FULL_RATIO : COLOR_RATIO;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="KESSIA"
      className={className}
      style={{
        height,
        width: Math.round(height * ratio),
        maxWidth: '100%',
        objectFit: 'contain',
        display: 'block',
        flexShrink: 0,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Symbole K — figure stylisée à 3 couleurs
//
// Géométrie (viewBox 0 0 180 206) :
//   • Orange : tête (cercle) + 2 bras symétriques en ellipses
//   • Vert   : barre diagonale centrale → bas-droit
//   • Gold   : cercle (tête droite) + teardrop → bas-gauche + cercle pied
// ─────────────────────────────────────────────────────────────
export function KessiaSymbol({
  size = 48,
  variant = 'full',
}: {
  size?: number;
  variant?: 'full' | 'white';
}) {
  const orange = variant === 'white' ? '#fff'                  : ORANGE;
  const gold   = variant === 'white' ? 'rgba(255,255,255,0.75)': GOLD;
  const green  = variant === 'white' ? 'rgba(255,255,255,0.55)': GREEN;

  // Ratio hauteur/largeur du viewBox
  const h = Math.round(size * 206 / 180);

  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 180 206"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="KESSIA symbole"
    >
      {/* ── ORDRE DE RENDU (bas → haut) ──────────────────── */}

      {/* 1. Barre VERTE — diagonale centre → bas-droit
              Axe : (90, 90) → (150, 170)
              Centre : (120, 130), ry=50, rotate(37°) */}
      <ellipse
        cx="120" cy="130"
        rx="14"  ry="50"
        transform="rotate(37 120 130)"
        fill={green}
      />

      {/* 2. Teardrop GOLD — figure bas-gauche
              Axe : (145, 96) → (38, 175)
              Centre : (91.5, 135.5), ry=67, rotate(54°) */}
      <ellipse
        cx="91.5" cy="135.5"
        rx="13"   ry="67"
        transform="rotate(54 91.5 135.5)"
        fill={gold}
      />

      {/* 3. Cercle GOLD — tête droite (s'aligne avec le haut du teardrop) */}
      <circle cx="145" cy="96" r="14" fill={gold} />

      {/* 4. Cercle GOLD — pied bas-gauche */}
      <circle cx="38" cy="178" r="16" fill={gold} />

      {/* 5. Bras ORANGE gauche — tête → bas-gauche
              Axe : (90, 30) → (40, 90)
              Centre : (65, 60), ry=39, rotate(40°) */}
      <ellipse
        cx="65" cy="60"
        rx="13" ry="39"
        transform="rotate(40 65 60)"
        fill={orange}
      />

      {/* 6. Bras ORANGE droit — tête → bas-droit
              Axe : (90, 30) → (140, 90)
              Centre : (115, 60), ry=39, rotate(-40°) */}
      <ellipse
        cx="115" cy="60"
        rx="13"  ry="39"
        transform="rotate(-40 115 60)"
        fill={orange}
      />

      {/* 7. Tête ORANGE — cercle supérieur (au-dessus de tout) */}
      <circle cx="90" cy="26" r="18" fill={orange} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Icône Mobile — icône applicative officielle (carré terracotta)
// Source : /public/logo/kessia-icon-192.png (coins transparents)
// ─────────────────────────────────────────────────────────────
export function KessiaMobileIcon({ size = 60 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo/kessia-icon-192.png"
      alt="KESSIA"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', display: 'block', flexShrink: 0 }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Logo Web complet — Symbole + Texte + Tagline optionnelle
// Exact selon le logo fourni
// ─────────────────────────────────────────────────────────────
export function KessiaLogo({
  variant = 'full',
  size = 40,
  showTagline = false,
  className = '',
}: KessiaLogoProps) {
  if (variant === 'symbol') {
    return <KessiaSymbol size={size} />;
  }

  // Fonds clairs → lockup couleur officiel
  if (variant !== 'white') {
    return <KessiaLogoImage height={size} showTagline={showTagline} className={className} />;
  }

  // variant "white" → lockup officiel blanc (PNG transparent, fonds sombres)
  //   • sans tagline  → /logo/kessia-logo-white.png       (symbole + « KESSIA »)
  //   • avec tagline  → /logo/kessia-logo-white-full.png  (+ « Épargner… / Grandir ensemble »)
  // Source : public/images/LOGO KESSIA.png, rognée aux boîtes de contenu.
  const src   = showTagline ? WHITE_SRC_FULL : WHITE_SRC;
  const ratio = showTagline ? WHITE_FULL_RATIO : WHITE_RATIO;
  const height = Math.round(size * 1.15);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="KESSIA"
      className={className}
      style={{
        height,
        width: Math.round(height * ratio),
        maxWidth: '100%',
        objectFit: 'contain',
        display: 'block',
        flexShrink: 0,
      }}
    />
  );
}

export default KessiaLogo;
