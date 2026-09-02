import type { Metadata } from 'next';
import GrowthClient from './growth-client';

export const metadata: Metadata = {
  title: 'Plan de croissance — KESSIA',
};

export default function GrowthPage() {
  return <GrowthClient />;
}
