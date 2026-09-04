import type { Metadata } from 'next';
import CommunityClient from './community-client';

export const metadata: Metadata = {
  title: 'Communauté KESSIA',
  description: 'Groupes, entraide et échanges entre entrepreneurs.',
};

export default function CommunityPage() {
  return <CommunityClient />;
}
