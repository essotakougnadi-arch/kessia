import type { Metadata } from 'next';
import ProfileClient from './profile-client';

export const metadata: Metadata = {
  title: 'Mon Profil — KESSIA',
  description: 'Gérez votre profil KESSIA, vos paramètres et votre score.',
};

export default function ProfilePage() {
  return <ProfileClient />;
}
