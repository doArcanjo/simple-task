// Thin routers: validate, delegate to db.js (which owns ownership checks and domain
// errors), respond. ownerId always comes from req.user.id, set by authGate.
import express from 'express';
import {
  registerInput,
  loginInput,
  changePasswordInput,
  deleteAccountInput,
  createProjectInput,
  updateProjectInput,
  createTaskInput,
  updateTaskInput,
  suggestInput,
  firstIssue,
} from '../shared/schemas.js';
import { hashPassword, verifyPassword, signToken, verifyToken, TokenError } from './auth.js';
import { AppError } from './errors.js';

export function parseBody(schema, req) {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw new AppError(400, 'invalid_request', firstIssue(result.error));
  }
  return result.data;
}

// Malformed ids (non-numeric, injection attempts, ...) fail exactly like a missing
// one — same status, code, and message — so existence is never leaked either way.
export function parseId(raw, message) {
  if (!/^\d+$/.test(String(raw))) {
    throw new AppError(404, 'not_found', message);
  }
  return Number(raw);
}

export function authGate({ config, db }) {
  return (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      next(new AppError(401, 'unauthenticated', 'Valid authentication is required'));
      return;
    }
    let payload;
    try {
      payload = verifyToken(token, config.jwtSecret);
    } catch (err) {
      if (err instanceof TokenError) {
        next(new AppError(401, 'unauthenticated', 'Valid authentication is required'));
        return;
      }
      next(err);
      return;
    }
    const user = db.findUserById(payload.sub);
    if (!user) {
      next(new AppError(401, 'unauthenticated', 'Valid authentication is required'));
      return;
    }
    req.user = { id: user.id, email: user.email };
    next();
  };
}

export function createAuthRouter({ config, db }) {
  const router = express.Router();

  router.post('/register', async (req, res) => {
    const { email, password } = parseBody(registerInput, req);
    if (db.findUserByEmail(email)) {
      throw new AppError(409, 'email_taken', 'That email is already registered');
    }
    const passwordHash = await hashPassword(password);
    const user = db.createUser({ email, passwordHash });
    res.status(201).json({ id: user.id, email: user.email, createdAt: user.createdAt });
  });

  router.post('/login', async (req, res) => {
    const { email, password } = parseBody(loginInput, req);
    const user = db.findUserByEmail(email);
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok) {
      throw new AppError(401, 'invalid_credentials', 'Email or password is incorrect');
    }
    const token = signToken({ sub: user.id }, config.jwtSecret, { expiresInSeconds: config.tokenTtlSeconds });
    res.json({ token, user: { id: user.id, email: user.email, createdAt: user.createdAt } });
  });

  return router;
}

// — AI suggest mock: canned steps by keyword, no provider seam, no external calls —
const KEYWORD_STEPS = [
  [/release|deploy|ship/i, ['tag the version', 'run the release checklist', 'announce to the team']],
  [/bug|fix|error|crash/i, ['reproduce the issue', 'write a failing test', 'patch and verify']],
  [/test|qa|coverage/i, ['list the cases', 'write the tests', 'run and review coverage']],
  [/doc|readme|write.?up/i, ['outline the sections', 'draft the content', 'proofread and publish']],
];
const GENERIC_STEPS = ['break it into smaller pieces', 'do the first piece', 'review before moving on'];

function stepsFor(text) {
  const match = KEYWORD_STEPS.find(([pattern]) => pattern.test(text));
  return match ? match[1] : GENERIC_STEPS;
}

function buildSuggestion(text) {
  const echo = text.length > 120 ? `${text.slice(0, 117)}...` : text;
  const line = `${echo} — steps: ${stepsFor(text).join('; ')}.`;
  return line.length > 500 ? line.slice(0, 500) : line;
}

export function createApiRouter({ db }) {
  const router = express.Router();

  router.get('/projects', (req, res) => {
    res.json(db.listProjects(req.user.id));
  });

  router.post('/projects', (req, res) => {
    const { name } = parseBody(createProjectInput, req);
    res.status(201).json(db.createProject(req.user.id, name));
  });

  router.put('/projects/:id', (req, res) => {
    const id = parseId(req.params.id, 'Project not found');
    const { name } = parseBody(updateProjectInput, req);
    res.json(db.renameProject(req.user.id, id, name));
  });

  router.delete('/projects/:id', (req, res) => {
    const id = parseId(req.params.id, 'Project not found');
    db.deleteProject(req.user.id, id);
    res.status(204).end();
  });

  router.get('/projects/:id/tasks', (req, res) => {
    const id = parseId(req.params.id, 'Project not found');
    res.json(db.listTasks(req.user.id, id));
  });

  router.post('/projects/:id/tasks', (req, res) => {
    const id = parseId(req.params.id, 'Project not found');
    const body = parseBody(createTaskInput, req);
    res.status(201).json(db.createTask(req.user.id, id, body));
  });

  router.get('/tasks/:id', (req, res) => {
    const id = parseId(req.params.id, 'Task not found');
    res.json(db.getTask(req.user.id, id));
  });

  router.put('/tasks/:id', (req, res) => {
    const id = parseId(req.params.id, 'Task not found');
    const patch = parseBody(updateTaskInput, req);
    res.json(db.updateTask(req.user.id, id, patch));
  });

  router.delete('/tasks/:id', (req, res) => {
    const id = parseId(req.params.id, 'Task not found');
    db.deleteTask(req.user.id, id);
    res.status(204).end();
  });

  router.post('/tasks/:id/complete', (req, res) => {
    const id = parseId(req.params.id, 'Task not found');
    res.json(db.completeTask(req.user.id, id));
  });

  router.post('/account/password', async (req, res) => {
    const { currentPassword, newPassword } = parseBody(changePasswordInput, req);
    const user = db.findUserById(req.user.id);
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AppError(401, 'invalid_credentials', 'Current password is incorrect');
    }
    db.updatePassword(req.user.id, await hashPassword(newPassword));
    res.status(204).end();
  });

  router.delete('/account', async (req, res) => {
    const { password } = parseBody(deleteAccountInput, req);
    const user = db.findUserById(req.user.id);
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new AppError(401, 'invalid_credentials', 'Password is incorrect');
    }
    db.deleteUser(req.user.id);
    res.status(204).end();
  });

  router.get('/export', (req, res) => {
    res.json(db.exportData(req.user.id));
  });

  router.post('/ai/suggest', (req, res) => {
    const { title, description } = parseBody(suggestInput, req);
    const input = [title, description].filter(Boolean).join(' — ');
    res.json({ suggestion: buildSuggestion(input) });
  });

  return router;
}
