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

async function registerAndLogin(baseUrl, email) {
  await request(baseUrl, 'POST', '/auth/register', { body: { email, password: 'supersecret1' } });
  const login = await request(baseUrl, 'POST', '/auth/login', { body: { email, password: 'supersecret1' } });
  return login.body.token;
}

describe('data isolation', () => {
  let db;
  let server;
  let baseUrl;
  let tokenA;
  let tokenB;
  let project;
  let task;

  beforeEach(async () => {
    ({ db, server, baseUrl } = await startApp());
    tokenA = await registerAndLogin(baseUrl, 'a@example.com');
    tokenB = await registerAndLogin(baseUrl, 'b@example.com');
    const createdProject = await request(baseUrl, 'POST', '/api/projects', { token: tokenA, body: { name: 'A only' } });
    project = createdProject.body;
    const createdTask = await request(baseUrl, 'POST', `/api/projects/${project.id}/tasks`, {
      token: tokenA,
      body: { description: 'A only task' },
    });
    task = createdTask.body;
  });

  afterEach(() => {
    server.close();
    db.close();
  });

  it('each account only lists its own projects', async () => {
    const listA = await request(baseUrl, 'GET', '/api/projects', { token: tokenA });
    const listB = await request(baseUrl, 'GET', '/api/projects', { token: tokenB });
    expect(listA.body).toHaveLength(1);
    expect(listB.body).toHaveLength(0);
  });

  it('a genuinely missing project 404s with the standard body', async () => {
    const res = await request(baseUrl, 'GET', '/api/projects/999999/tasks', { token: tokenA });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'not_found', message: 'Project not found' } });
  });

  it('a foreign project 404s with a byte-identical body to a missing one', async () => {
    const foreign = await request(baseUrl, 'GET', `/api/projects/${project.id}/tasks`, { token: tokenB });
    const missing = await request(baseUrl, 'GET', '/api/projects/999999/tasks', { token: tokenB });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
  });

  it('a foreign task 404s the same as a missing one', async () => {
    const foreign = await request(baseUrl, 'GET', `/api/tasks/${task.id}`, { token: tokenB });
    const missing = await request(baseUrl, 'GET', '/api/tasks/999999', { token: tokenB });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: { code: 'not_found', message: 'Task not found' } });
    expect(foreign.body).toEqual(missing.body);
  });

  it('cannot rename a foreign project', async () => {
    const res = await request(baseUrl, 'PUT', `/api/projects/${project.id}`, { token: tokenB, body: { name: 'stolen' } });
    expect(res.status).toBe(404);
  });

  it('cannot delete a foreign project', async () => {
    const res = await request(baseUrl, 'DELETE', `/api/projects/${project.id}`, { token: tokenB });
    expect(res.status).toBe(404);
  });

  it('cannot edit a foreign task', async () => {
    const res = await request(baseUrl, 'PUT', `/api/tasks/${task.id}`, { token: tokenB, body: { description: 'stolen' } });
    expect(res.status).toBe(404);
  });

  it('cannot delete a foreign task', async () => {
    const res = await request(baseUrl, 'DELETE', `/api/tasks/${task.id}`, { token: tokenB });
    expect(res.status).toBe(404);
  });

  it('cannot complete a foreign task', async () => {
    const res = await request(baseUrl, 'POST', `/api/tasks/${task.id}/complete`, { token: tokenB });
    expect(res.status).toBe(404);
  });

  it('a non-numeric id 404s exactly like a missing one', async () => {
    const bad = await request(baseUrl, 'GET', '/api/tasks/abc', { token: tokenA });
    const missing = await request(baseUrl, 'GET', '/api/tasks/999999', { token: tokenA });
    expect(bad.status).toBe(404);
    expect(bad.body).toEqual(missing.body);
  });

  it('an injection-shaped id 404s exactly like a missing one', async () => {
    const bad = await request(baseUrl, 'GET', `/api/tasks/${encodeURIComponent('1 OR 1=1')}`, { token: tokenA });
    const missing = await request(baseUrl, 'GET', '/api/tasks/999999', { token: tokenA });
    expect(bad.status).toBe(404);
    expect(bad.body).toEqual(missing.body);
  });

  it('ownerId cannot be set on project creation (strict schema)', async () => {
    const res = await request(baseUrl, 'POST', '/api/projects', { token: tokenB, body: { name: 'x', ownerId: 1 } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_request');
  });

  it('id, completed and completedAt cannot be set on task creation (strict schema)', async () => {
    const res = await request(baseUrl, 'POST', `/api/projects/${project.id}/tasks`, {
      token: tokenA,
      body: { description: 'x', completed: true },
    });
    expect(res.status).toBe(400);
  });
});
