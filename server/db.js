// better-sqlite3 data access. Schema is created at its final shape (no migrations).
// Ownership is enforced in every WHERE clause, and functions that resolve a single
// project/task throw the domain not-found/lock errors directly, so routes.js stays thin.
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { AppError } from './errors.js';

function mapUser(row) {
  if (!row) {
    return null;
  }
  return { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: row.created_at };
}

function mapProject(row) {
  return { id: row.id, ownerId: row.owner_id, name: row.name, createdAt: row.created_at };
}

// Optional fields are omitted from the JSON shape entirely when absent, per the API contract.
function mapTask(row) {
  const task = { id: row.id, projectId: row.project_id };
  if (row.title !== null) {
    task.title = row.title;
  }
  task.description = row.description;
  task.createdAt = row.created_at;
  if (row.finish_date !== null) {
    task.finishDate = row.finish_date;
  }
  task.completed = row.completed === 1;
  if (row.completed_at !== null) {
    task.completedAt = row.completed_at;
  }
  return task;
}

export function createDb({ file }) {
  if (file !== ':memory:') {
    mkdirSync(dirname(file), { recursive: true });
  }
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      finish_date TEXT,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
      completed_at TEXT,
      CHECK (completed = 1 OR completed_at IS NULL)
    );
    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
  `);

  const insertUser = db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)');
  const selectUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const selectUserById = db.prepare('SELECT * FROM users WHERE id = ?');
  const updateUserPassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  const deleteUserStmt = db.prepare('DELETE FROM users WHERE id = ?');

  const insertProject = db.prepare('INSERT INTO projects (owner_id, name, created_at) VALUES (?, ?, ?)');
  const selectProjectsByOwner = db.prepare('SELECT * FROM projects WHERE owner_id = ? ORDER BY id');
  const selectProject = db.prepare('SELECT * FROM projects WHERE id = ? AND owner_id = ?');
  const updateProjectName = db.prepare('UPDATE projects SET name = ? WHERE id = ? AND owner_id = ?');
  const deleteProjectStmt = db.prepare('DELETE FROM projects WHERE id = ? AND owner_id = ?');
  const countCompletedInProject = db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE project_id = ? AND completed = 1');

  const insertTask = db.prepare(
    'INSERT INTO tasks (project_id, title, description, created_at, finish_date) VALUES (?, ?, ?, ?, ?)',
  );
  const selectTasksByProject = db.prepare(
    'SELECT tasks.* FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.project_id = ? AND projects.owner_id = ? ORDER BY tasks.id',
  );
  const selectTask = db.prepare(
    'SELECT tasks.* FROM tasks JOIN projects ON projects.id = tasks.project_id WHERE tasks.id = ? AND projects.owner_id = ?',
  );
  const updateTaskStmt = db.prepare('UPDATE tasks SET title = ?, description = ?, finish_date = ? WHERE id = ?');
  const completeTaskStmt = db.prepare('UPDATE tasks SET completed = 1, completed_at = ? WHERE id = ?');
  const deleteTaskStmt = db.prepare('DELETE FROM tasks WHERE id = ?');

  function createUser({ email, passwordHash }) {
    const createdAt = new Date().toISOString();
    try {
      const info = insertUser.run(email, passwordHash, createdAt);
      return mapUser(selectUserById.get(info.lastInsertRowid));
    } catch (err) {
      if (err.code && err.code.startsWith('SQLITE_CONSTRAINT')) {
        throw new AppError(409, 'email_taken', 'That email is already registered');
      }
      throw err;
    }
  }

  function findUserByEmail(email) {
    return mapUser(selectUserByEmail.get(email));
  }

  function findUserById(id) {
    return mapUser(selectUserById.get(id));
  }

  function updatePassword(id, hash) {
    updateUserPassword.run(hash, id);
  }

  function deleteUser(id) {
    deleteUserStmt.run(id); // FK cascade removes projects and tasks
  }

  function listProjects(ownerId) {
    return selectProjectsByOwner.all(ownerId).map(mapProject);
  }

  function createProject(ownerId, name) {
    const createdAt = new Date().toISOString();
    const info = insertProject.run(ownerId, name, createdAt);
    return mapProject(selectProject.get(info.lastInsertRowid, ownerId));
  }

  function getProject(ownerId, id) {
    const row = selectProject.get(id, ownerId);
    if (!row) {
      throw new AppError(404, 'not_found', 'Project not found');
    }
    return mapProject(row);
  }

  function renameProject(ownerId, id, name) {
    getProject(ownerId, id);
    updateProjectName.run(name, id, ownerId);
    return getProject(ownerId, id);
  }

  function projectHasCompletedTask(ownerId, id) {
    getProject(ownerId, id);
    return countCompletedInProject.get(id).n > 0;
  }

  function deleteProject(ownerId, id) {
    getProject(ownerId, id);
    if (projectHasCompletedTask(ownerId, id)) {
      throw new AppError(409, 'project_shielded', 'Project has a completed task and cannot be deleted');
    }
    deleteProjectStmt.run(id, ownerId);
  }

  function listTasks(ownerId, projectId) {
    getProject(ownerId, projectId);
    return selectTasksByProject.all(projectId, ownerId).map(mapTask);
  }

  function createTask(ownerId, projectId, { title, description, finishDate }) {
    getProject(ownerId, projectId);
    const createdAt = new Date().toISOString();
    const info = insertTask.run(projectId, title ?? null, description, createdAt, finishDate ?? null);
    return mapTask(selectTask.get(info.lastInsertRowid, ownerId));
  }

  function getTask(ownerId, id) {
    const row = selectTask.get(id, ownerId);
    if (!row) {
      throw new AppError(404, 'not_found', 'Task not found');
    }
    return mapTask(row);
  }

  function updateTask(ownerId, id, patch) {
    const current = getTask(ownerId, id);
    if (current.completed) {
      throw new AppError(409, 'task_locked', 'Completed tasks cannot be edited');
    }
    const title = 'title' in patch ? patch.title : (current.title ?? null);
    const description = 'description' in patch ? patch.description : current.description;
    const finishDate = 'finishDate' in patch ? patch.finishDate : (current.finishDate ?? null);
    updateTaskStmt.run(title ?? null, description, finishDate ?? null, id);
    return getTask(ownerId, id);
  }

  function deleteTask(ownerId, id) {
    const current = getTask(ownerId, id);
    if (current.completed) {
      throw new AppError(409, 'task_locked', 'Completed tasks cannot be deleted');
    }
    deleteTaskStmt.run(id);
  }

  function completeTask(ownerId, id) {
    const current = getTask(ownerId, id);
    if (current.completed) {
      throw new AppError(409, 'task_locked', 'Task is already completed');
    }
    completeTaskStmt.run(new Date().toISOString(), id);
    return getTask(ownerId, id);
  }

  function exportData(ownerId) {
    const user = findUserById(ownerId);
    const projects = listProjects(ownerId).map((project) => ({
      ...project,
      tasks: selectTasksByProject.all(project.id, ownerId).map(mapTask),
    }));
    return { exportedAt: new Date().toISOString(), user: { email: user.email }, projects };
  }

  function close() {
    db.close();
  }

  return {
    createUser,
    findUserByEmail,
    findUserById,
    updatePassword,
    deleteUser,
    listProjects,
    createProject,
    getProject,
    renameProject,
    deleteProject,
    projectHasCompletedTask,
    listTasks,
    createTask,
    getTask,
    updateTask,
    deleteTask,
    completeTask,
    exportData,
    close,
  };
}
