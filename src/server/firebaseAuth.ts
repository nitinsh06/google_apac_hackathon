import { createPublicKey, createVerify } from 'node:crypto';

/**
 * Verifies Firebase Auth ID tokens against Google's published signing
 * certificates. This keeps the server free of the Admin SDK — and therefore of
 * service-account credentials — while still proving who the caller is.
 */

const CERT_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

let cache: CertCache | null = null;

async function signingCerts(): Promise<Record<string, string>> {
  if (cache && cache.expiresAt > Date.now()) return cache.certs;

  const response = await fetch(CERT_URL);
  if (!response.ok) {
    throw new Error(`Could not fetch Google signing certificates (${response.status}).`);
  }

  const certs = (await response.json()) as Record<string, string>;
  const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '');
  const ttlMs = maxAge ? Number(maxAge[1]) * 1000 : 60 * 60 * 1000;

  cache = { certs, expiresAt: Date.now() + Math.min(ttlMs, 6 * 60 * 60 * 1000) };
  return certs;
}

const decodeSegment = (segment: string): any =>
  JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));

export interface VerifiedToken {
  uid: string;
  email?: string;
}

export async function verifyFirebaseIdToken(
  token: string,
  projectId: string
): Promise<VerifiedToken> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed ID token.');

  let header: any;
  let payload: any;
  try {
    header = decodeSegment(parts[0]);
    payload = decodeSegment(parts[1]);
  } catch {
    throw new Error('Malformed ID token.');
  }

  if (header.alg !== 'RS256') throw new Error('Unexpected token algorithm.');
  if (typeof header.kid !== 'string') throw new Error('ID token has no key id.');

  const certs = await signingCerts();
  const cert = certs[header.kid];
  if (!cert) throw new Error('ID token was signed with an unknown key.');

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();

  if (!verifier.verify(createPublicKey(cert), Buffer.from(parts[2], 'base64url'))) {
    throw new Error('ID token signature is invalid.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('ID token expired.');
  if (typeof payload.iat !== 'number' || payload.iat > now + 60) {
    throw new Error('ID token is not valid yet.');
  }
  if (payload.aud !== projectId) throw new Error('ID token was issued for another project.');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('ID token has an unexpected issuer.');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('ID token has no subject.');
  }

  return { uid: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined };
}
