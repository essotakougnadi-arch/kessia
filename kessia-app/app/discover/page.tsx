import type { Metadata } from 'next';
import DiscoverClient from './discover-client';

export const metadata: Metadata = {
  title: 'KESSIA — Tontines ouvertes',
  description:
    'Découvrez les tontines publiques ouvertes sur KESSIA : épargne collective, achat groupé, projets. Rejoignez la communauté.',
};

export default function DiscoverPage() {
  return <DiscoverClient />;
}
