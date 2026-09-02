// ============================================================
// KESSIA — Stockage objet Supabase (cahier des charges §30)
//
// Accès à Supabase Storage via l'API REST (pas de SDK) avec la clé
// service. Si l'environnement n'est pas configuré, `configured()`
// renvoie false et l'appelant retombe sur le stockage en base
// (data-URI) — comportement dev / tests.
//
// Voir docs/decisions/0003 et 0014.
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function storageConfigured(): boolean {
  return !!SUPABASE_URL && !!SERVICE_KEY;
}

function base(): string {
  return `${SUPABASE_URL}/storage/v1`;
}
function authHeaders(): Record<string, string> {
  return { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY ?? '' };
}

/** Téléverse (ou remplace) un objet. Renvoie true si OK. */
export async function putObject(
  bucket: string,
  path: string,
  bytes: Buffer,
  contentType: string,
): Promise<boolean> {
  if (!storageConfigured()) return false;
  try {
    const res = await fetch(`${base()}/object/${bucket}/${encodeURI(path)}`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': contentType, 'x-upsert': 'true' },
      body: new Uint8Array(bytes),
    });
    if (!res.ok) {
      console.error('[STORAGE] putObject', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[STORAGE] putObject', e);
    return false;
  }
}

/** URL signée courte durée pour lire un objet privé. */
export async function signObjectUrl(
  bucket: string,
  path: string,
  expiresIn = 300,
): Promise<string | null> {
  if (!storageConfigured()) return null;
  try {
    const res = await fetch(`${base()}/object/sign/${bucket}/${encodeURI(path)}`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ expiresIn }),
    });
    if (!res.ok) {
      console.error('[STORAGE] signObjectUrl', res.status);
      return null;
    }
    const body = (await res.json()) as { signedURL?: string };
    return body.signedURL ? `${base()}${body.signedURL}` : null;
  } catch (e) {
    console.error('[STORAGE] signObjectUrl', e);
    return null;
  }
}

/** Supprime un ou plusieurs objets. Best-effort. */
export async function removeObjects(bucket: string, paths: string[]): Promise<void> {
  if (!storageConfigured() || paths.length === 0) return;
  try {
    await fetch(`${base()}/object/${bucket}`, {
      method: 'DELETE',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ prefixes: paths }),
    });
  } catch (e) {
    console.error('[STORAGE] removeObjects', e);
  }
}
