// Passwords (scrypt) and tokens (HMAC-SHA256 JWT) on node:crypto only — no auth
// library, per the brief. Nothing cryptographic is invented here; what is designed
// is the record format and the verification rules.
//
// Deliberately dropped from the fuller build, and documented in the README:
// rehash-on-login, the decoy record for unknown emails, and NFKC normalization.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// One constant. Below the OWASP floor (2^17) on purpose: ~60ms per hash keeps the
// demo responsive on unknown hardware. Raising it later invalidates no record,
// because each record carries its own parameters.
const PARAMS = { N: 2 ** 15, r: 8, p: 1, keylen: 64, saltBytes: 16 };
const maxmem = 256 * PARAMS.N * PARAMS.r;

// Record: scrypt$N=...,r=...,p=...,keylen=...$<salt b64>$<hash b64>
// keylen is stored because scrypt output is a prefix stream: a truncated hash would
// verify against a matching short derivation. Stating the length makes truncation a
// malformed record instead.
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('A password is required');
  }
  const salt = randomBytes(PARAMS.saltBytes);
  const hash = await scryptAsync(password, salt, PARAMS.keylen, { ...PARAMS, maxmem });
  const params = `N=${PARAMS.N},r=${PARAMS.r},p=${PARAMS.p},keylen=${PARAMS.keylen}`;
  return ['scrypt', params, salt.toString('base64'), hash.toString('base64')].join('$');
}

function parseRecord(record) {
  if (typeof record !== 'string') {
    return null;
  }
  const [algorithm, params, salt, hash] = record.split('$');
  if (algorithm !== 'scrypt' || !params || !salt || !hash) {
    return null;
  }
  const numbers = Object.fromEntries(params.split(',').map((pair) => pair.split('=').map((v, i) => (i ? Number(v) : v))));
  const { N, r, p, keylen } = numbers;
  if (![N, r, p, keylen].every((v) => Number.isInteger(v) && v > 0)) {
    return null;
  }
  const saltBytes = Buffer.from(salt, 'base64');
  const hashBytes = Buffer.from(hash, 'base64');
  if (saltBytes.length === 0 || hashBytes.length !== keylen) {
    return null;
  }
  return { N, r, p, keylen, salt: saltBytes, hash: hashBytes };
}

export async function verifyPassword(password, record) {
  const parsed = parseRecord(record);
  if (!parsed || typeof password !== 'string' || password.length === 0) {
    return false;
  }
  const { N, r, p, keylen, salt, hash } = parsed;
  const candidate = await scryptAsync(password, salt, keylen, { N, r, p, maxmem: 256 * N * r });
  if (candidate.length !== hash.length) {
    return false;
  }
  return timingSafeEqual(candidate, hash); // constant-time: no partial-match leak
}

// — tokens —
const ALGORITHM = 'HS256';

export class TokenError extends Error {}

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (input, secret) => createHmac('sha256', secret).update(input).digest('base64url');

function decodeJson(segment) {
  try {
    const value = JSON.parse(Buffer.from(segment, 'base64url').toString());
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function signToken(payload, secret, { now = Math.floor(Date.now() / 1000), expiresInSeconds = 86_400 } = {}) {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('A signing secret is required');
  }
  const input = `${encode({ alg: ALGORITHM, typ: 'JWT' })}.${encode({ ...payload, iat: now, exp: now + expiresInSeconds })}`;
  return `${input}.${sign(input, secret)}`;
}

export function verifyToken(token, secret, { now = Math.floor(Date.now() / 1000) } = {}) {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('A signing secret is required');
  }
  if (typeof token !== 'string') {
    throw new TokenError('malformed token');
  }
  const segments = token.split('.');
  if (segments.length !== 3 || !segments[0] || !segments[1]) {
    throw new TokenError('malformed token');
  }
  const [encodedHeader, encodedPayload, signature] = segments;

  // The token never chooses how it is verified: alg is checked, not obeyed —
  // checked before the signature so "alg: none" is rejected as what it is.
  const header = decodeJson(encodedHeader);
  if (!header || header.alg !== ALGORITHM) {
    throw new TokenError(`only ${ALGORITHM} is accepted`);
  }

  const expected = sign(`${encodedHeader}.${encodedPayload}`, secret);
  const [given, ours] = [Buffer.from(signature), Buffer.from(expected)];
  if (given.length !== ours.length || !timingSafeEqual(given, ours)) {
    throw new TokenError('bad signature');
  }

  const payload = decodeJson(encodedPayload);
  if (!payload) {
    throw new TokenError('malformed payload');
  }
  if (typeof payload.exp === 'number' && now >= payload.exp) {
    throw new TokenError('token expired');
  }
  return payload;
}
