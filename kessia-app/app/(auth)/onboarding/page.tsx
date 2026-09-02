import type { Metadata } from 'next';
import OnboardingClient from './onboarding-client';

export const metadata: Metadata = {
  title: 'Bienvenue sur KESSIA',
};

export default function OnboardingPage() {
  return <OnboardingClient />;
}
