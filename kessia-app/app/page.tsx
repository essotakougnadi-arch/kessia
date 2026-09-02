import type { Metadata } from 'next';
import LandingClient from './landing-client';

// La locale est persistée côté client (localStorage) : la <metadata> rendue au
// serveur reste en français (marché principal Togo). Le contenu de la page est
// traduit FR / EN par LandingClient (§38).
export const metadata: Metadata = {
  title: 'KESSIA — Ensemble, construisons l\'avenir.',
  description:
    'Épargner ensemble. Entreprendre ensemble. Grandir ensemble. La super app coopérative de l\'entrepreneuriat africain.',
};

export default function LandingPage() {
  return <LandingClient />;
}
