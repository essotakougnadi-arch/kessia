import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Document — KESSIA',
};

// Layout minimal : pas de sidebar ni de navigation, optimisé impression.
export default function DocumentsLayout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
