// ============================================================
// KESSIA — E-mail transactionnel (§7, §33)
//
// Abstraction analogue aux canaux de notification : l'app appelle
// `sendEmail()`, le fournisseur réel (Resend) n'est utilisé que si
// `RESEND_API_KEY` est renseigné. Sinon : SIMULATION (log serveur,
// aucun mail réel envoyé). Ne lève jamais.
// ============================================================

import { logApiError } from '@/lib/logger';

export type EmailAttachment = {
  filename: string;
  /** contenu binaire */
  content: Uint8Array;
  contentType?: string;
};

export type EmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
};

export type EmailResult = {
  sent: boolean;
  simulated: boolean;
  provider: 'resend' | 'simulation';
  detail?: string;
};

const FROM = process.env.EMAIL_FROM || 'KESSIA <no-reply@kessia.app>';

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  if (!looksLikeEmail(input.to)) {
    return { sent: false, simulated: true, provider: 'simulation', detail: 'adresse invalide' };
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(
      `[EMAIL] (simulation) → ${input.to} · « ${input.subject} »` +
        (input.attachments?.length ? ` · ${input.attachments.length} pièce(s) jointe(s)` : '')
    );
    return { sent: true, simulated: true, provider: 'simulation', detail: 'aucun fournisseur configuré' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content).toString('base64'),
        })),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { sent: false, simulated: false, provider: 'resend', detail: `HTTP ${res.status} ${body.slice(0, 120)}` };
    }
    return { sent: true, simulated: false, provider: 'resend' };
  } catch (e) {
    logApiError('lib/email/sendEmail', e);
    return { sent: false, simulated: false, provider: 'resend', detail: String(e).slice(0, 160) };
  }
}
