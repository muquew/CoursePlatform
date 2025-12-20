import { createHmac, timingSafeEqual } from 'crypto';

// Minimal JWT (HS256) helper.
// - No external deps
// - Designed for API token usage in ROUTES.md

export type JwtAlgorithm = 'HS256';

export type JwtSignOptions = {
  issuer?: string;
  audience?: string;
  expiresInSec?: number; // e.g. 3600
  notBeforeSec?: number; // seconds from now
  subject?: string; // maps to `sub`
  jwtId?: string; // maps to `jti`
  now?: number; // unix seconds override (tests)
};

export type JwtVerifyOptions = {
  issuer?: string;
  audience?: string;
  now?: number; // unix seconds override (tests)
  clockSkewSec?: number; // allow small clock skew
};

export type JwtHeader = {
  alg: JwtAlgorithm;
  typ?: 'JWT';
};

export type JwtClaims = {
  iss?: string;
  aud?: string;
  sub?: string;
  jti?: string;
  iat?: number;
  nbf?: number;
  exp?: number;
  // custom claims
  [k: string]: unknown;
};

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function b64urlEncodeJson(obj: unknown): string {
  return b64urlEncode(Buffer.from(JSON.stringify(obj)));
}

function b64urlDecodeToBuf(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function hmacSha256(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

export function signJwt(payload: JwtClaims, secret: string, opts: JwtSignOptions = {}): string {
  if (!secret) throw new Error('JWT secret required');
  const now = opts.now ?? Math.floor(Date.now() / 1000);

  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };
  const claims: JwtClaims = {
    ...payload,
    iss: opts.issuer ?? payload.iss,
    aud: opts.audience ?? payload.aud,
    sub: opts.subject ?? payload.sub,
    jti: opts.jwtId ?? payload.jti,
    iat: payload.iat ?? now,
  };
  if (typeof opts.notBeforeSec === 'number') claims.nbf = now + opts.notBeforeSec;
  if (typeof opts.expiresInSec === 'number') claims.exp = now + opts.expiresInSec;

  const encodedHeader = b64urlEncodeJson(header);
  const encodedPayload = b64urlEncodeJson(claims);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const sig = b64urlEncode(hmacSha256(signingInput, secret));
  return `${signingInput}.${sig}`;
}

export type JwtVerifyResult<TClaims extends JwtClaims = JwtClaims> = {
  header: JwtHeader;
  claims: TClaims;
};

export class JwtError extends Error {
  code:
    | 'JWT_MALFORMED'
    | 'JWT_INVALID_SIGNATURE'
    | 'JWT_EXPIRED'
    | 'JWT_NOT_ACTIVE'
    | 'JWT_CLAIMS_INVALID';
  constructor(code: JwtError['code'], message: string) {
    super(message);
    this.name = 'JwtError';
    this.code = code;
  }
}

export function verifyJwt<TClaims extends JwtClaims = JwtClaims>(
  token: string,
  secret: string,
  opts: JwtVerifyOptions = {},
): JwtVerifyResult<TClaims> {
  if (!token) throw new JwtError('JWT_MALFORMED', 'Missing token');
  const parts = token.split('.');
  const h = parts[0];
  const p = parts[1];
  const s = parts[2];
  if (!h || !p || !s || parts.length !== 3) throw new JwtError('JWT_MALFORMED', 'Malformed token');
  const signingInput = `${h}.${p}`;

  const expected = b64urlEncode(hmacSha256(signingInput, secret));
  // timing-safe compare
  const a = Buffer.from(s, 'utf8');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new JwtError('JWT_INVALID_SIGNATURE', 'Invalid signature');
  }

  const header = safeJsonParse<JwtHeader>(b64urlDecodeToBuf(h).toString('utf8'));
  const claims = safeJsonParse<TClaims>(b64urlDecodeToBuf(p).toString('utf8'));
  if (!header || !claims || header.alg !== 'HS256') throw new JwtError('JWT_MALFORMED', 'Invalid token');

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const skew = opts.clockSkewSec ?? 5;

  if (opts.issuer && claims.iss && claims.iss !== opts.issuer) {
    throw new JwtError('JWT_CLAIMS_INVALID', 'Issuer mismatch');
  }
  if (opts.audience && claims.aud && claims.aud !== opts.audience) {
    throw new JwtError('JWT_CLAIMS_INVALID', 'Audience mismatch');
  }

  if (typeof claims.nbf === 'number' && now + skew < claims.nbf) {
    throw new JwtError('JWT_NOT_ACTIVE', 'Token not active');
  }
  if (typeof claims.exp === 'number' && now - skew >= claims.exp) {
    throw new JwtError('JWT_EXPIRED', 'Token expired');
  }

  return { header, claims };
}
