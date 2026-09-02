import styles from './admin.module.css';
import type { Translate } from '@/lib/i18n/core';

const KYC: Record<string, string> = {
  VERIFIED: 'p_green',
  UNDER_REVIEW: 'p_amber',
  IN_PROGRESS: 'p_blue',
  ACTION_REQUIRED: 'p_amber',
  REJECTED: 'p_red',
  EXPIRED: 'p_grey',
  NOT_STARTED: 'p_grey',
};

const TICKET: Record<string, string> = {
  OPEN: 'p_blue',
  IN_PROGRESS: 'p_amber',
  WAITING: 'p_amber',
  RESOLVED: 'p_green',
  CLOSED: 'p_grey',
};

const TX: Record<string, string> = {
  COMPLETED: 'p_green',
  PENDING: 'p_amber',
  PROCESSING: 'p_blue',
  FAILED: 'p_red',
  REVERSED: 'p_grey',
  CANCELLED: 'p_grey',
};

const TONTINE: Record<string, string> = {
  ACTIVE: 'p_green',
  PENDING: 'p_amber',
  COMPLETED: 'p_blue',
  SUSPENDED: 'p_red',
  CANCELLED: 'p_grey',
};

function pill(t: Translate, group: string, map: Record<string, string>, key: string) {
  const cls = map[key] ?? 'p_grey';
  return <span className={`${styles.pill} ${styles[cls]}`}>{t(`admin.pill.${group}.${key}`)}</span>;
}

export const kycPill = (t: Translate, s: string) => pill(t, 'kyc', KYC, s);
export const ticketPill = (t: Translate, s: string) => pill(t, 'ticket', TICKET, s);
export const txPill = (t: Translate, s: string) => pill(t, 'tx', TX, s);
export const tontinePill = (t: Translate, s: string) => pill(t, 'tontine', TONTINE, s);
