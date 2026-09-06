import { getAccessToken } from './googleAuth.ts';

/**
 * Firestore access for the background worker.
 *
 * The request-scoped code path reads Firestore *as the caller* with their own
 * ID token, which is why no service account was needed there. A worker has no
 * caller — the event arrives from Eventarc — so it acts as the Cloud Run
 * instance instead. Same REST surface, different credential, still no Admin SDK
 * and no key file on disk.
 */

type FirestoreValue = Record<string, any>;

const BASE = 'https://firestore.googleapis.com/v1';

function documentUrl(projectId: string, databaseId: string | undefined, path: string): string {
  const database = databaseId || '(default)';
  const encoded = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${BASE}/projects/${projectId}/databases/${encodeURIComponent(database)}/documents/${encoded}`;
}

// ── Value coding ──────────────────────────────────────────────────────────

export function decodeValue(value: FirestoreValue): unknown {
  if (value === null || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    return (value.arrayValue?.values ?? []).map((item: FirestoreValue) => decodeValue(item));
  }
  if ('mapValue' in value) return decodeFields(value.mapValue?.fields ?? {});
  return null;
}

export function decodeFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) out[key] = decodeValue(value);
  return out;
}

function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    // Everything numeric in this app is a ratio or a score, so doubles keep the
    // round-trip exact rather than silently truncating 0.72 to 0.
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  }
  return { nullValue: null };
}

export function encodeFields(data: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue; // Strict undefined-stripping, as elsewhere.
    fields[key] = encodeValue(value);
  }
  return fields;
}

// ── Operations ────────────────────────────────────────────────────────────

export interface AdminTarget {
  projectId: string;
  databaseId?: string;
}

/** Returns null for a missing document rather than throwing. */
export async function adminGetDocument(
  target: AdminTarget,
  path: string
): Promise<Record<string, unknown> | null> {
  const token = await getAccessToken();
  const response = await fetch(documentUrl(target.projectId, target.databaseId, path), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Firestore read failed for ${path} (${response.status}).`);
  }

  const document = (await response.json()) as { fields?: Record<string, FirestoreValue> };
  return decodeFields(document.fields ?? {});
}

/** Full replace, matching the client's `setDoc(..., { merge: false })`. */
export async function adminWriteDocument(
  target: AdminTarget,
  path: string,
  data: Record<string, unknown>
): Promise<void> {
  const token = await getAccessToken();

  // Naming every field in updateMask makes this a replace rather than a merge,
  // so a shrinking record cannot leave stale keys behind.
  const mask = Object.keys(data)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join('&');

  const response = await fetch(
    `${documentUrl(target.projectId, target.databaseId, path)}?${mask}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ fields: encodeFields(data) }),
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Firestore write failed for ${path} (${response.status}). ${detail.slice(0, 200)}`);
  }
}

/** Lists a collection, following pagination. Used for the monthly rollup. */
export async function adminListCollection(
  target: AdminTarget,
  path: string,
  pageSize = 300
): Promise<Array<Record<string, unknown>>> {
  const token = await getAccessToken();
  const out: Array<Record<string, unknown>> = [];
  let pageToken: string | undefined;

  // Bounded so a runaway collection cannot spin here forever.
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(documentUrl(target.projectId, target.databaseId, path));
    url.searchParams.set('pageSize', String(pageSize));
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Firestore list failed for ${path} (${response.status}).`);
    }

    const body = (await response.json()) as {
      documents?: Array<{ fields?: Record<string, FirestoreValue> }>;
      nextPageToken?: string;
    };
    for (const document of body.documents ?? []) out.push(decodeFields(document.fields ?? {}));

    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }

  return out;
}
