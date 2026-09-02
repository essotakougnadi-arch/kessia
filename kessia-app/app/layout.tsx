import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/Toaster';
import { I18nProvider } from '@/lib/i18n';
import { THEME_INIT_SCRIPT } from '@/store/themeStore';
import { ACCENT_INIT_SCRIPT } from '@/store/accentStore';
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#B65A3A',
};

export const metadata: Metadata = {
  title: {
    default: 'KESSIA — Super App Coopérative Africaine',
    template: '%s | KESSIA',
  },
  description:
    "KESSIA est la plateforme numérique coopérative de l'entrepreneuriat africain. Épargner ensemble. Entreprendre ensemble. Grandir ensemble.",
  keywords: [
    'tontine', 'épargne', 'entrepreneuriat africain',
    'coopérative', 'fintech Togo', 'UEMOA', 'business management', 'KESSIA',
  ],
  authors: [{ name: 'KESSIA' }],
  creator: 'KESSIA',
  openGraph: {
    type: 'website',
    locale: 'fr_TG',
    url: 'https://kessia.app',
    title: 'KESSIA — Super App Coopérative Africaine',
    description: 'Épargner ensemble. Entreprendre ensemble. Grandir ensemble.',
    siteName: 'KESSIA',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KESSIA',
    description: "La plateforme numérique de l'entrepreneuriat africain",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: ACCENT_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <I18nProvider>
          {children}
          <Toaster />
          <ServiceWorkerRegister />
        </I18nProvider>
      </body>
    </html>
  );
}
