/**
 * KESSIA — Logo Manager
 *
 * Ce fichier sert de point d'entrée centralisé pour le logo.
 * Pour utiliser le vrai fichier logo :
 *   1. Placez logo.svg (ou logo.png) dans /public/logo/
 *   2. Décommentez la section "USE_IMAGE_FILE" ci-dessous
 *   3. Commentez la section "USE_SVG_CODE"
 *
 * Le logo SVG codé reste disponible comme fallback.
 */

// ─────────────────────────────────────────────
// Re-export depuis KessiaLogo.tsx (SVG code)
// ─────────────────────────────────────────────
export {
  KessiaLogo,
  KessiaSymbol,
  KessiaMobileIcon,
} from './KessiaLogo';

export { KessiaLogo as default } from './KessiaLogo';

// ─────────────────────────────────────────────
// USE_IMAGE_FILE — Décommentez quand le fichier logo est disponible
// ─────────────────────────────────────────────
//
// import Image from 'next/image';
//
// export function KessiaLogoImage({
//   width = 160,
//   height = 60,
//   variant = 'color',        // 'color' | 'white' | 'icon'
//   className = '',
// }: {
//   width?: number;
//   height?: number;
//   variant?: 'color' | 'white' | 'icon';
//   className?: string;
// }) {
//   const src =
//     variant === 'white' ? '/logo/kessia-logo-white.svg' :
//     variant === 'icon'  ? '/logo/kessia-icon.png' :
//                           '/logo/kessia-logo.svg';
//
//   return (
//     <Image
//       src={src}
//       alt="KESSIA"
//       width={width}
//       height={height}
//       className={className}
//       priority
//     />
//   );
// }
