import type { Metadata } from 'next';
import ExploreClient from './explore-client';

export const metadata: Metadata = {
  title: 'Explorer KESSIA — Services',
};

export default function ExplorePage() {
  return <ExploreClient />;
}
