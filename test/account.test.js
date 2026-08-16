import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../server/db.js';
import { createApp } from '../server/app.js';

function testConfig(overrides = {}) {
  return {
    jwtSecret: 'test-secret',
    tokenTtlSeconds: 86_400,
    trustProxy: false,
    frontendDir: '/no-such-static-dir-in-tests',
    version: '1.0.0-test',
    authRateLimit: { enabled: false, limit: 10, windowMs: 60_000 },
    ...overrides,
  };
}

async function startApp(overrides) {
  const db = createDb({ file: ':memory:' });
  const app = createApp({ config: testConfig(overrides), db });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return { db, server, baseUrl };
}

async function request(baseUrl, method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : undefined };
}

async function registerAndLogin(baseUrl, email, password) {
  await request(baseUrl, 'POST', '/auth/register', { body: { email, password } });
  const login = await request(baseUrl, 'POST', '/auth/login', { body: { email, password } });
  return { token: login.body.token, userId: login.body.user.id };
}

describe('account', () => {
  let db;
  let server;
  let baseUrl;
  let token;
  let userId;

  beforeEach(async () => {
    ({ db, server, baseUrl } = await startApp());
    ({ token, userId } = await registerAndLogin(baseUrl, 'owner@example.com', 'original-pass1'));
  });

  afterEach(() => {
    server.close();
    db.close();
  });

  it('changes the password: old stops working, new works', async () => {
    const change = await request(baseUrl, 'POST', '/api/account/password', {
      token,
      body: { currentPassword: 'original-pass1', newPassword: 'brand-new-pass1' },
    });
    expect(change.status).toBe(204);

    const oldLogin = await request(baseUrl, 'POST', '/auth/login', {
      body: { email: 'owner@example.com', password: 'original-pass1' },
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(baseUrl, 'POST', '/auth/login', {
      body: { email: 'owner@example.com', password: 'brand-new-pass1' },
    });
    expect(newLogin.status).toBe(200);
  });

  it('rejects a password change with the wrong current password', async () => {
    const res = await request(baseUrl, 'POST', '/api/account/password', {
      token,
      body: { currentPassword: 'totally-wrong', newPassword: 'brand-new-pass1' },
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_credentials');

    const stillWorks = await request(baseUrl, 'POST', '/auth/login', {
      body: { email: 'owner@example.com', password: 'original-pass1' },
    });
    expect(stillWorks.status).toBe(200);
  });

  it('rejects a too-short new password', async () => {
    const res = await request(baseUrl, 'POST', '/api/account/password', {
      token,
      body: { currentPassword: 'original-pass1', newPassword: 'short' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects account deletion with the wrong password', async () => {
    const res = await request(baseUrl, 'DELETE', '/api/account', { token, body: { password: 'totally-wrong' } });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_credentials');

    const stillThere = await request(baseUrl, 'GET', '/api/projects', { token });
    expect(stillThere.status).toBe(200);
  });

  it('rejects account deletion with a missing password field', async () => {
    const res = await request(baseUrl, 'DELETE', '/api/account', { token, body: {} });
    expect(res.status).toBe(400);
  });

  it('deletes the account and immediately kills the token', async () => {
    const del = await request(baseUrl, 'DELETE', '/api/account', { token, body: { password: 'original-pass1' } });
    expect(del.status).toBe(204);

    const afterDelete = await request(baseUrl, 'GET', '/api/projects', { token });
    expect(afterDelete.status).toBe(401);
    expect(afterDelete.body.error.code).toBe('unauthenticated');
  });

  it('cascades project deletion when the account is deleted', async () => {
    await request(baseUrl, 'POST', '/api/projects', { token, body: { name: 'Will vanish' } });
    await request(baseUrl, 'DELETE', '/api/account', { token, body: { password: 'original-pass1' } });
    expect(db.listProjects(userId)).toHaveLength(0);
  });

  it('exports only the caller\'s own data', async () => {
    const { token: otherToken } = await registerAndLogin(baseUrl, 'other@example.com', 'other-pass-123');
    await request(baseUrl, 'POST', '/api/projects', { token, body: { name: 'Mine' } });
    await request(baseUrl, 'POST', '/api/projects', { token: otherToken, body: { name: 'Theirs' } });

    const exported = await request(baseUrl, 'GET', '/api/export', { token });
    expect(exported.status).toBe(200);
    expect(exported.body.user.email).toBe('owner@example.com');
    expect(exported.body.projects).toHaveLength(1);
    expect(exported.body.projects[0].name).toBe('Mine');
    expect(typeof exported.body.exportedAt).toBe('string');
  });

  it('export includes each project\'s tasks', async () => {
    const project = await request(baseUrl, 'POST', '/api/projects', { token, body: { name: 'P' } });
    await request(baseUrl, 'POST', `/api/projects/${project.body.id}/tasks`, { token, body: { description: 'D' } });

    const exported = await request(baseUrl, 'GET', '/api/export', { token });
    expect(exported.body.projects[0].tasks).toHaveLength(1);
    expect(exported.body.projects[0].tasks[0].description).toBe('D');
  });
});
