import { createPublicKey, createVerify } from 'node:crypto';

/**
 * The two credentials a Cloud Run instance already has, and nothing more.
 *
 *  - An access token for its own service account, fetched from the metadata
 *    server. This is what lets the background worker read and write Firestore
 *    when there is no signed-in caller to borrow a token from.
 *  - The means to verify the OIDC token Eventarc attaches to a delivery, so an
 *    endpoint that must be publicly routable is still only callable by the
 *    trigger.
 *
 * No service-account JSON file, and still no Admin SDK.
 */

const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-account/token';

const GOOGLE_OIDC_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';

// ── Outbound: this instance's own identity ────────────────────────────────

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  // Refresh a minute early rather than racing an expiry mid-request.
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const response = await fetch(METADATA_TOKEN_URL, {
    headers: { 'Metadata-Flavor': 'Google' },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(
      `Metadata server returned ${response.status}. The analytics worker only runs on Google Cloud, where the instance has its own service account.`
    );
  }

  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error('Metadata server returned no access token.');

  tokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
  return tokenCache.token;
}

/** True when this process can act as itself — i.e. it is running on GCP. */
export async function hasInstanceIdentity(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

// ── Inbound: proving a delivery came from Eventarc ────────────────────────

interface Jwk {
  kid: string;
  n: string;
  e: string;
  kty: string;
  alg?: string;
}

let certCache: { keys: Map<string, Jwk>; expiresAt: number } | null = null;

async function oidcKeys(): Promise<Map<string, Jwk>> {
  if (certCache && certCache.expiresAt > Date.now()) return certCache.keys;

  const response = await fetch(GOOGLE_OIDC_CERTS);
  if (!response.ok) {
    throw new Error(`Could not fetch Google OIDC certificates (${response.status}).`);
  }

  const body = (await response.json()) as { keys: Jwk[] };
  const keys = new Map(body.keys.map((key) => [key.kid, key]));

  const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '');
  const ttlMs = maxAge ? Number(maxAge[1]) * 1000 : 60 * 60 * 1000;

  certCache = { keys, expiresAt: Date.now() + Math.min(ttlMs, 6 * 60 * 60 * 1000) };
  return keys;
}

const decodeSegment = (segment: string): any =>
  JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));

export interface VerifiedCaller {
  email: string;
  subject: string;
}

/**
 * Verifies a Google-issued OIDC identity token.
 *
 * `audience` and `serviceAccount` are both required on purpose: a valid Google
 * token proves only that *some* Google principal signed it. Pinning the
 * audience stops a token minted for another service being replayed here, and
 * pinning the email stops any other principal in the project from invoking the
 * worker.
 */
export async function verifyGoogleIdToken(
  token: string,
  options: { audience: string; serviceAccount: string }
): Promise<VerifiedCaller> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed identity token.');

  let header: any;
  let payload: any;
  try {
    header = decodeSegment(parts[0]);
    payload = decodeSegment(parts[1]);
  } catch {
    throw new Error('Malformed identity token.');
  }

  if (header.alg !== 'RS256') throw new Error('Unexpected token algorithm.');
  if (typeof header.kid !== 'string') throw new Error('Identity token has no key id.');

  const key = (await oidcKeys()).get(header.kid);
  if (!key) throw new Error('Identity token was signed with an unknown key.');

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();

  const publicKey = createPublicKey({ key: key as any, format: 'jwk' });
  if (!verifier.verify(publicKey, Buffer.from(parts[2], 'base64url'))) {
    throw new Error('Identity token signature is invalid.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    throw new Error('Identity token expired.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > now + 60) {
    throw new Error('Identity token is not valid yet.');
  }
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
    throw new Error('Identity token has an unexpected issuer.');
  }
  if (payload.aud !== options.audience) {
    throw new Error('Identity token was issued for a different audience.');
  }
  if (payload.email !== options.serviceAccount || payload.email_verified !== true) {
    throw new Error('Identity token belongs to an unexpected principal.');
  }

  return { email: payload.email, subject: String(payload.sub ?? '') };
}
