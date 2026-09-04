import type { Metadata } from 'next';
import JobsClient from './jobs-client';

export const metadata: Metadata = {
  title: 'KESSIA Jobs',
  description: 'Emplois, stages et missions freelance près de chez vous.',
};

export default function JobsPage() {
  return <JobsClient />;
}
