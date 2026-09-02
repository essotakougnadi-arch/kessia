import type { Metadata } from 'next';
import HomeClient from './home-client';

export const metadata: Metadata = {
  title: 'Accueil — KESSIA',
  description: 'Tableau de bord KESSIA',
};

export default function HomePage() {
  return <HomeClient />;
}
