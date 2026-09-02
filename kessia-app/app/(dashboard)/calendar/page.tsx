import type { Metadata } from 'next';
import CalendarClient from './calendar-client';

export const metadata: Metadata = {
  title: 'Agenda — KESSIA',
};

export default function CalendarPage() {
  return <CalendarClient />;
}
