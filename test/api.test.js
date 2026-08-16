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

describe('api', () => {
  let db;
  let server;
  let baseUrl;
  let token;

  beforeEach(async () => {
    ({ db, server, baseUrl } = await startApp());
    const register = await request(baseUrl, 'POST', '/auth/register', {
      body: { email: 'alice@example.com', password: 'supersecret1' },
    });
    expect(register.status).toBe(201);
    const login = await request(baseUrl, 'POST', '/auth/login', {
      body: { email: 'alice@example.com', password: 'supersecret1' },
    });
    token = login.body.token;
  });

  afterEach(() => {
    server.close();
    db.close();
  });

  it('GET /health reports status and version only', async () => {
    const res = await request(baseUrl, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', version: '1.0.0-test' });
  });

  it('rejects duplicate registration', async () => {
    const res = await request(baseUrl, 'POST', '/auth/register', {
      body: { email: 'alice@example.com', password: 'anotherpass1' },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('email_taken');
  });

  it('rejects login with the wrong password', async () => {
    const res = await request(baseUrl, 'POST', '/auth/login', {
      body: { email: 'alice@example.com', password: 'wrong-password' },
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: 'invalid_credentials', message: 'Email or password is incorrect' });
  });

  it('rejects login for an unknown email with the same message', async () => {
    const res = await request(baseUrl, 'POST', '/auth/login', {
      body: { email: 'nobody@example.com', password: 'wrong-password' },
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: 'invalid_credentials', message: 'Email or password is incorrect' });
  });

  it('creates and lists projects', async () => {
    const created = await request(baseUrl, 'POST', '/api/projects', { token, body: { name: 'Launch' } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Launch' });
    expect(created.body.ownerId).toBeDefined();

    const list = await request(baseUrl, 'GET', '/api/projects', { token });
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
  });

  it('rejects an empty project name', async () => {
    const res = await request(baseUrl, 'POST', '/api/projects', { token, body: { name: '' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_request');
  });

  it('rejects unknown fields on project create (strict schema)', async () => {
    const res = await request(baseUrl, 'POST', '/api/projects', { token, body: { name: 'x', extra: 1 } });
    expect(res.status).toBe(400);
  });

  it('renames a project', async () => {
    const created = await request(baseUrl, 'POST', '/api/projects', { token, body: { name: 'Old' } });
    const renamed = await request(baseUrl, 'PUT', `/api/projects/${created.body.id}`, { token, body: { name: 'New' } });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('New');
  });

  it('creates a task with only a required description', async () => {
    const project = await request(baseUrl, 'POST', '/api/projects', { token, body: { name: 'P' } });
    const task = await request(baseUrl, 'POST', `/api/projects/${project.body.id}/tasks`, {
      token,
      body: { description: 'Do the thing' },
    });
    expect(task.status).toBe(201);
    expect(task.body.description).toBe('Do the thing');
    expect(task.body).not.toHaveProperty('title');
    expect(task.body).not.toHaveProperty('finishDate');
    expect(task.body).not.toHaveProperty('completedAt');
    expect(task.body.completed).toBe(false);
  });

  it('rejects a description over the length limit', async () => {
    const project = await request(baseUrl, 'POST', '/api/projects', { token, body: { name: 'P' } });
    const res = await request(baseUrl, 'POST', `/api/projects/${project.body.id}/tasks`, {
      token,
      body: { description: 'x'.repeat(501) },
    });
    expect(res.status).toBe(400);
  });

  it('fetches a single task', async () => {
    const project = await request(baseUrl, 'POST', '/api/projects', { token, body: { name: 'P' } });
    const created = await request(baseUrl, 'POST', `/api/projects/${project.body.id}/tasks`, {
      token,
      body: { title: 'Title', description: 'Desc', finishDate: '2099-01-01' },
    });
    const fetched = await request(baseUrl, 'GET', `/api/tasks/${created.body.id}`, { token });
    expect(fetched.status).toBe(200);
    expect(fetched.body.title).toBe('Title');
    expect(fetched.body.finishDate).toBe('2099-01-01');
  });

  it('removes title and finishDate via explicit null', async () => {
    const project = await request(baseUrl, 'POST', '/api/projects', { token, body: { name: 'P' } });
    const created = await request(baseUrl, 'POST', `/api/projects/${project.body.id}/tasks`, {
      token,
      body: { title: 'Title', description: 'Desc', finishDate: '2099-01-01' },
    });
    const patched = await request(baseUrl, 'PUT', `/api/tasks/${created.body.id}`, {
      token,
      body: { title: null, finishDate: null },
    });
    expect(patched.status).toBe(200);
    expect(patched.body).not.toHaveProperty('title');
    expect(patched.body).not.toHaveProperty('finishDate');
    expect(patched.body.description).toBe('Desc');
  });

  it('rejects an empty patch', async () => {
    const project = await request(baseUrl, 'POST', '/api/projects', { token, body: { name: 'P' } });
    const created = await request(baseUrl, 'POST', `/api/projects/${project.body.id}/tasks`, {
      token,
      body: { description: 'Desc' },
    });
    const res = await request(baseUrl, 'PUT', `/api/tasks/${created.body.id}`, { token, body: {} });
    expect(res.status).toBe(400);
  });

  it('completes a task and stamps completedAt', async () => {
    const project = await request(baseUrl, 'POST', '/api/projects', { token, body: { name: 'P' } });
    const created = await request(baseUrl, 'POST', `/api/projects/${project.body.id}/tasks`, {
      token,
      body: { description: 'Desc' },
    });
    const completed = await request(baseUrl, 'POST', `/api/tasks/${created.body.id}/complete`, { token });
    expect(completed.status).toBe(200);
    expect(completed.body.completed).toBe(true);
    expect(typeof completed.body.completedAt).toBe('string');
  });

  it('locks a completed task against edits', async () => {
    const project = await request(baseUrl, 'POST', '/api/projects', { token, body: { name: 'P' } });
    const created = await request(baseUrl, 'POST', `/api/projects/${project.body.id}/tasks`, {
      token,
      body: { description: 'Desc' },
    });
    await request(baseUrl, 'POST', `/api/tasks/${created.body.id}/complete`, { token });

    const editRes = await request(baseUrl, 'PUT', `/api/tasks/${created.body.id}`, { token, body: { description: 'New' } });
    expect(editRes.status).toBe(409);
    expect(editRes.body.error.code).toBe('task_locked');

    const deleteRes = await request(baseUrl, 'DELETE', `/api/tasks/${created.body.id}`, { token });
    expect(deleteRes.status).toBe(409);
    expect(deleteRes.body.error.code).toBe('task_locked');

    const completeAgainRes = await request(baseUrl, 'POST', `/api/tasks/${created.body.id}/complete`, { token });
    expect(completeAgainRes.status).toBe(409);
    expect(completeAgainRes.body.error.code).toBe('task_locked');
  });

  it('shields a project containing a completed task from deletion, permanently', async () => {
    const project = await request(baseUrl, 'POST', '/api/projects', { token, body: { name: 'Shielded' } });
    const created = await request(baseUrl, 'POST', `/api/projects/${project.body.id}/tasks`, {
      token,
      body: { description: 'Desc' },
    });
    await request(baseUrl, 'POST', `/api/tasks/${created.body.id}/complete`, { token });

    const firstAttempt = await request(baseUrl, 'DELETE', `/api/projects/${project.body.id}`, { token });
    expect(firstAttempt.status).toBe(409);
    expect(firstAttempt.body.error.code).toBe('project_shielded');

    // The completed task can never be removed, so the shield can never be lifted.
    const secondAttempt = await request(baseUrl, 'DELETE', `/api/projects/${project.body.id}`, { token });
    expect(secondAttempt.status).toBe(409);
    expect(secondAttempt.body.error.code).toBe('project_shielded');
  });

  it('deletes a project with no completed tasks', async () => {
    const project = await request(baseUrl, 'POST', '/api/projects', { token, body: { name: 'Deletable' } });
    const res = await request(baseUrl, 'DELETE', `/api/projects/${project.body.id}`, { token });
    expect(res.status).toBe(204);
  });

  it('returns invalid_json for malformed request bodies', async () => {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{not valid json',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_json');
  });

  it('returns route_not_found for unmatched routes without echoing the path', async () => {
    const res = await request(baseUrl, 'GET', '/api/nope-not-a-real-route', { token });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('route_not_found');
    expect(res.body.error.message).not.toContain('nope-not-a-real-route');
  });
});
