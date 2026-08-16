<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { changePasswordInput, deleteAccountInput, firstIssue } from 'shared/schemas.js';
import { api, onSessionExpired, setToken } from './api.js';
import { loadSession, saveSession, clearSession } from './session.js';
import AuthScreen from './AuthScreen.vue';
import ProjectList from './ProjectList.vue';
import TaskPanel from './TaskPanel.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import EditTaskDialog from './EditTaskDialog.vue';
import Toast from './Toast.vue';

const DRAFT_KEY = 'task-manager-draft';

const session = ref(loadSession());
const projects = ref([]);
const selectedProjectId = ref(null);
const tasks = ref([]);
const loadingProjects = ref(false);
const loadingTasks = ref(false);
const projectActionBusy = ref(false);
const taskDialogBusy = ref(false);
const confirmBusy = ref(false);
const busyTaskId = ref(null);
const draftPending = ref(false);

const taskPanelRef = ref(null);
const passwordDialogEl = ref(null);
const deleteAccountEl = ref(null);

const toast = reactive({ message: '', type: 'success', id: 0 });
function notify(message, type = 'success') {
  toast.message = message;
  toast.type = type;
  toast.id += 1;
}

const confirmState = reactive({ open: false, kind: null, target: null, message: '' });
const editState = reactive({ open: false, task: null });
const passwordForm = reactive({ current: '', next: '' });
const passwordError = ref('');
const passwordBusy = ref(false);
const deleteForm = reactive({ password: '' });
const deleteError = ref('');
const deleteBusy = ref(false);

const selectedProject = computed(() => projects.value.find((p) => p.id === selectedProjectId.value) ?? null);

if (session.value) {
  setToken(session.value.token);
}

// True only after this tab has actually used the session successfully — so a
// stale token found at boot signs out quietly instead of announcing an ending
// to a session that never started here.
let sessionLive = false;

// Any 401 "unauthenticated" from any call lands here: stash the draft, sign out.
onSessionExpired(() => {
  const draft = taskPanelRef.value?.getDraft();
  if (draft && (draft.title || draft.description || draft.finishDate)) {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage failures
    }
  }
  session.value = null;
  clearSession();
  setToken(null);
  projects.value = [];
  tasks.value = [];
  selectedProjectId.value = null;
  if (sessionLive) {
    sessionLive = false;
    notify('Session ended — sign in again', 'error');
  }
});

// Restore a saved draft once a project (and thus TaskPanel) is mounted again.
watch(selectedProject, (project) => {
  if (project && draftPending.value) {
    draftPending.value = false;
    restoreDraft();
  }
});

function restoreDraft() {
  let raw = null;
  try {
    raw = sessionStorage.getItem(DRAFT_KEY);
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    raw = null;
  }
  if (!raw) {
    return;
  }
  try {
    taskPanelRef.value?.setDraft(JSON.parse(raw));
  } catch {
    // ignore malformed draft
  }
}

function hasSavedDraft() {
  try {
    return sessionStorage.getItem(DRAFT_KEY) !== null;
  } catch {
    return false;
  }
}

async function loadProjects() {
  loadingProjects.value = true;
  try {
    projects.value = await api.get('/api/projects');
    sessionLive = true;
    if (projects.value.length > 0 && selectedProjectId.value === null) {
      selectProject(projects.value[0].id);
    }
  } catch (error) {
    if (error.code !== 'unauthenticated') {
      notify(error.message, 'error');
    }
  } finally {
    loadingProjects.value = false;
  }
}

async function selectProject(id) {
  selectedProjectId.value = id;
  loadingTasks.value = true;
  try {
    tasks.value = await api.get(`/api/projects/${id}/tasks`);
  } catch (error) {
    if (error.code !== 'unauthenticated') {
      notify(error.message, 'error');
    }
  } finally {
    loadingTasks.value = false;
  }
}

async function onAuthenticated(result) {
  session.value = { token: result.token, user: result.user };
  saveSession(session.value);
  setToken(result.token);
  draftPending.value = hasSavedDraft();
  await loadProjects();
}

function onAuthToast(payload) {
  notify(payload.message, payload.type);
}

async function createProject(name) {
  projectActionBusy.value = true;
  try {
    const project = await api.post('/api/projects', { name });
    projects.value.push(project);
    notify('Project created');
    if (selectedProjectId.value === null) {
      selectProject(project.id);
    }
  } catch (error) {
    if (error.code !== 'unauthenticated') {
      notify(error.message, 'error');
    }
  } finally {
    projectActionBusy.value = false;
  }
}

async function renameProject(id, name) {
  projectActionBusy.value = true;
  try {
    const updated = await api.put(`/api/projects/${id}`, { name });
    const index = projects.value.findIndex((p) => p.id === id);
    if (index !== -1) {
      projects.value[index] = updated;
    }
    notify('Project renamed');
  } catch (error) {
    if (error.code !== 'unauthenticated') {
      notify(error.message, 'error');
    }
  } finally {
    projectActionBusy.value = false;
  }
}

async function requestDeleteProject(project) {
  let projectTasks = tasks.value;
  if (project.id !== selectedProjectId.value) {
    try {
      projectTasks = await api.get(`/api/projects/${project.id}/tasks`);
    } catch (error) {
      if (error.code !== 'unauthenticated') {
        notify(error.message, 'error');
      }
      return;
    }
  }
  const pendingCount = projectTasks.filter((t) => !t.completed).length;
  const noun = pendingCount === 1 ? 'task' : 'tasks';
  confirmState.kind = 'deleteProject';
  confirmState.target = project;
  confirmState.message = `Delete project "${project.name}" and its ${pendingCount} pending ${noun}?`;
  confirmState.open = true;
}

function requestDeleteTask(task) {
  confirmState.kind = 'deleteTask';
  confirmState.target = task;
  confirmState.message = task.title
    ? `Delete task "${task.title}"? This cannot be undone.`
    : 'Delete this task? This cannot be undone.';
  confirmState.open = true;
}

function cancelConfirm() {
  confirmState.open = false;
  confirmState.kind = null;
  confirmState.target = null;
}

async function confirmDelete() {
  confirmBusy.value = true;
  try {
    if (confirmState.kind === 'deleteProject') {
      const project = confirmState.target;
      await api.del(`/api/projects/${project.id}`);
      projects.value = projects.value.filter((p) => p.id !== project.id);
      if (selectedProjectId.value === project.id) {
        selectedProjectId.value = null;
        tasks.value = [];
        if (projects.value.length > 0) {
          selectProject(projects.value[0].id);
        }
      }
      notify('Project deleted');
    } else if (confirmState.kind === 'deleteTask') {
      const task = confirmState.target;
      await api.del(`/api/tasks/${task.id}`);
      tasks.value = tasks.value.filter((t) => t.id !== task.id);
      notify('Task deleted');
    }
    cancelConfirm();
  } catch (error) {
    if (error.code !== 'unauthenticated') {
      notify(error.message, 'error');
    }
    cancelConfirm();
  } finally {
    confirmBusy.value = false;
  }
}

function onTaskCreated(task) {
  tasks.value.push(task);
  notify('Task added');
}

async function completeTask(task) {
  busyTaskId.value = task.id;
  try {
    const updated = await api.post(`/api/tasks/${task.id}/complete`);
    const index = tasks.value.findIndex((t) => t.id === task.id);
    if (index !== -1) {
      tasks.value[index] = updated;
    }
    notify('Task completed');
  } catch (error) {
    if (error.code !== 'unauthenticated') {
      notify(error.message, 'error');
    }
  } finally {
    busyTaskId.value = null;
  }
}

function openEdit(task) {
  editState.open = true;
  editState.task = task;
}

function cancelEdit() {
  editState.open = false;
  editState.task = null;
}

async function saveEdit(patch) {
  taskDialogBusy.value = true;
  try {
    const updated = await api.put(`/api/tasks/${editState.task.id}`, patch);
    const index = tasks.value.findIndex((t) => t.id === updated.id);
    if (index !== -1) {
      tasks.value[index] = updated;
    }
    notify('Task updated');
    cancelEdit();
  } catch (error) {
    if (error.code !== 'unauthenticated') {
      notify(error.message, 'error');
    }
  } finally {
    taskDialogBusy.value = false;
  }
}

function logout() {
  session.value = null;
  clearSession();
  setToken(null);
  projects.value = [];
  tasks.value = [];
  selectedProjectId.value = null;
}

async function exportData() {
  try {
    const data = await api.get('/api/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tasks-export.json';
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    if (error.code !== 'unauthenticated') {
      notify(error.message, 'error');
    }
  }
}

function openPasswordDialog() {
  passwordForm.current = '';
  passwordForm.next = '';
  passwordError.value = '';
  passwordDialogEl.value?.showModal();
}

function closePasswordDialog() {
  passwordDialogEl.value?.close();
}

async function submitPasswordChange() {
  const result = changePasswordInput.safeParse({
    currentPassword: passwordForm.current,
    newPassword: passwordForm.next,
  });
  if (!result.success) {
    passwordError.value = firstIssue(result.error);
    return;
  }
  passwordBusy.value = true;
  try {
    await api.post('/api/account/password', result.data);
    notify('Password changed');
    closePasswordDialog();
  } catch (error) {
    if (error.code === 'unauthenticated') {
      return;
    }
    passwordError.value = error.message;
  } finally {
    passwordBusy.value = false;
  }
}

function openDeleteAccount() {
  deleteForm.password = '';
  deleteError.value = '';
  deleteAccountEl.value?.showModal();
}

function closeDeleteAccount() {
  deleteAccountEl.value?.close();
}

async function submitDeleteAccount() {
  const result = deleteAccountInput.safeParse({ password: deleteForm.password });
  if (!result.success) {
    deleteError.value = firstIssue(result.error);
    return;
  }
  deleteBusy.value = true;
  try {
    await api.del('/api/account', result.data);
    notify('Account deleted');
    closeDeleteAccount();
    logout();
  } catch (error) {
    if (error.code === 'unauthenticated') {
      return;
    }
    deleteError.value = error.message;
  } finally {
    deleteBusy.value = false;
  }
}

onMounted(() => {
  if (session.value) {
    loadProjects();
  }
});
</script>

<template>
  <div class="app-shell">
    <AuthScreen v-if="!session" @authenticated="onAuthenticated" @toast="onAuthToast" />
    <template v-else>
      <header class="app-header">
        <h1>Task Manager</h1>
        <div class="header-actions">
          <button type="button" class="ghost-button" @click="exportData">Export</button>
          <details class="account-menu">
            <summary>{{ session.user.email }}</summary>
            <div class="account-menu-panel">
              <button type="button" class="link-button" @click="openPasswordDialog">Change password</button>
              <button type="button" class="link-button danger-text" @click="openDeleteAccount">Delete account</button>
              <button type="button" class="link-button" @click="logout">Log out</button>
            </div>
          </details>
        </div>
      </header>

      <main class="app-main">
        <ProjectList
          :projects="projects" :selected-id="selectedProjectId" :loading="loadingProjects" :busy="projectActionBusy"
          @select="selectProject" @create="createProject" @rename="renameProject" @delete="requestDeleteProject"
        />
        <TaskPanel
          v-if="selectedProject" ref="taskPanelRef"
          :project="selectedProject" :tasks="tasks" :loading="loadingTasks" :busy-task-id="busyTaskId"
          @task-created="onTaskCreated" @toast="(payload) => notify(payload.message, payload.type)"
          @complete="completeTask" @edit="openEdit" @delete="requestDeleteTask"
        />
        <p v-else class="empty-state panel-placeholder">Select or create a project to see its tasks.</p>
      </main>
    </template>

    <Toast :message="toast.message" :type="toast.type" :id="toast.id" />

    <ConfirmDialog
      :open="confirmState.open" title="Confirm delete" :message="confirmState.message" confirm-label="Delete"
      :busy="confirmBusy" @confirm="confirmDelete" @cancel="cancelConfirm"
    />

    <EditTaskDialog
      :open="editState.open" :task="editState.task" :busy="taskDialogBusy" @save="saveEdit" @cancel="cancelEdit"
    />

    <dialog ref="passwordDialogEl" class="app-dialog">
      <h2>Change password</h2>
      <form @submit.prevent="submitPasswordChange">
        <div class="field">
          <label for="current-password">Current password</label>
          <input id="current-password" v-model="passwordForm.current" type="password" autocomplete="current-password" />
        </div>
        <div class="field">
          <label for="new-password">New password</label>
          <input id="new-password" v-model="passwordForm.next" type="password" autocomplete="new-password" />
        </div>
        <p v-if="passwordError" class="field-error" role="alert">{{ passwordError }}</p>
        <div class="dialog-actions">
          <button type="button" class="ghost-button" :disabled="passwordBusy" @click="closePasswordDialog">Cancel</button>
          <button type="submit" class="primary-button" :disabled="passwordBusy">{{ passwordBusy ? 'Saving…' : 'Save' }}</button>
        </div>
      </form>
    </dialog>

    <dialog ref="deleteAccountEl" class="app-dialog">
      <h2>Delete account</h2>
      <p class="danger-warning">This permanently deletes your account and every project and task you own. This cannot be undone.</p>
      <form @submit.prevent="submitDeleteAccount">
        <div class="field">
          <label for="delete-password">Type your password to confirm</label>
          <input id="delete-password" v-model="deleteForm.password" type="password" autocomplete="current-password" />
        </div>
        <p v-if="deleteError" class="field-error" role="alert">{{ deleteError }}</p>
        <div class="dialog-actions">
          <button type="button" class="ghost-button" :disabled="deleteBusy" @click="closeDeleteAccount">Cancel</button>
          <button type="submit" class="danger-button" :disabled="deleteBusy">{{ deleteBusy ? 'Deleting…' : 'Delete account' }}</button>
        </div>
      </form>
    </dialog>
  </div>
</template>
