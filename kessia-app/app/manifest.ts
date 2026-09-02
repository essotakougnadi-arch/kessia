import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KESSIA — Super App Coopérative Africaine',
    short_name: 'KESSIA',
    description:
      'Épargner ensemble. Entreprendre ensemble. Grandir ensemble. Tontines, wallet et gestion business.',
    start_url: '/home',
    display: 'standalone',
    background_color: '#FAF8F5',
    theme_color: '#B65A3A',
    lang: 'fr',
    orientation: 'portrait',
    icons: [
      {
        src: '/logo/kessia-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo/kessia-icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
