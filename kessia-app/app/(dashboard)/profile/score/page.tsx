import type { Metadata } from 'next';
import ScoreClient from './score-client';

export const metadata: Metadata = {
  title: 'KESSIA Score — KESSIA',
};

export default function ScorePage() {
  return <ScoreClient />;
}
