/** @type {import('next').NextConfig} */
const nextConfig = {
  // Aucune image distante servie par l'app (KYC/avatars/marketplace passent
  // par des data-URI ou des URLs signées Supabase, jamais par next/image) —
  // liste vide = la route framework /_next/image ne proxifie aucune URL
  // externe (P1.9, Lot A : `hostname: '**'` exposait un SSRF potentiel).
  images: {
    remotePatterns: [],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://fonts.googleapis.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https:",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
