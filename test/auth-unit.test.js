import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, signToken, verifyToken, TokenError } from '../server/auth.js';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('password hashing', () => {
  it('round-trips: the correct password verifies', async () => {
    const record = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', record)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const record = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password here', record)).toBe(false);
  });

  it('produces the documented scrypt record format', async () => {
    const record = await hashPassword('some password 123');
    expect(record).toMatch(/^scrypt\$N=\d+,r=\d+,p=\d+,keylen=\d+\$[^$]+\$[^$]+$/);
  });

  it('rejects a truncated stored hash (keylen regression)', async () => {
    const record = await hashPassword('some password 123');
    const [alg, params, salt, hash] = record.split('$');
    const truncated = [alg, params, salt, hash.slice(0, hash.length - 8)].join('$');
    expect(await verifyPassword('some password 123', truncated)).toBe(false);
  });

  it('returns false, never throws, for malformed records', async () => {
    for (const bad of ['', 'not-a-record', 'scrypt$only-two-parts', null, undefined, 42]) {
      expect(await verifyPassword('anything', bad)).toBe(false);
    }
  });

  it('rejects an empty password on hashing', async () => {
    await expect(hashPassword('')).rejects.toThrow();
  });
});

describe('tokens', () => {
  const secret = 'unit-test-secret';

  it('round-trips a payload through sign and verify', () => {
    const token = signToken({ sub: 7 }, secret);
    const payload = verifyToken(token, secret);
    expect(payload.sub).toBe(7);
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
  });

  it('rejects a tampered payload segment', () => {
    const token = signToken({ sub: 7 }, secret);
    const [header, payload, signature] = token.split('.');
    const tampered = `${header}.${payload}x.${signature}`;
    expect(() => verifyToken(tampered, secret)).toThrow(TokenError);
  });

  it('rejects alg:none', () => {
    const header = encode({ alg: 'none', typ: 'JWT' });
    const payload = encode({ sub: 1, iat: 0, exp: 9_999_999_999 });
    expect(() => verifyToken(`${header}.${payload}.`, secret)).toThrow(TokenError);
  });

  it('rejects an alg swap', () => {
    const header = encode({ alg: 'HS512', typ: 'JWT' });
    const payload = encode({ sub: 1, iat: 0, exp: 9_999_999_999 });
    expect(() => verifyToken(`${header}.${payload}.forged`, secret)).toThrow(TokenError);
  });

  it('rejects an expired token', () => {
    const token = signToken({ sub: 1 }, secret, { now: 1000, expiresInSeconds: 10 });
    expect(() => verifyToken(token, secret, { now: 1011 })).toThrow(TokenError);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signToken({ sub: 1 }, secret);
    expect(() => verifyToken(token, 'a-different-secret')).toThrow(TokenError);
  });

  it('rejects malformed token strings', () => {
    for (const bad of ['not-a-token', '', 'a.b', 'a.b.c.d', null, undefined]) {
      expect(() => verifyToken(bad, secret)).toThrow(TokenError);
    }
  });

  it('rejects a header that is not valid JSON', () => {
    const badHeader = Buffer.from('not json').toString('base64url');
    const payload = encode({ sub: 1, iat: 0, exp: 9_999_999_999 });
    expect(() => verifyToken(`${badHeader}.${payload}.sig`, secret)).toThrow(TokenError);
  });
});
