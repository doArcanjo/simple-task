<script setup>
import { computed, nextTick, reactive, ref } from 'vue';
import { createTaskInput, suggestInput, firstIssue } from 'shared/schemas.js';
import { taskStatus, PENDING, OVERDUE, COMPLETED } from 'shared/status.js';
import { api, ApiError } from './api.js';
import TaskItem from './TaskItem.vue';

const props = defineProps({
  project: { type: Object, required: true },
  tasks: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  busyTaskId: { default: null },
});
const emit = defineEmits(['task-created', 'toast', 'complete', 'edit', 'delete']);

const titleInput = ref(null);
const form = reactive({ title: '', description: '', finishDate: '' });
const formError = ref('');
const creating = ref(false);
const suggesting = ref(false);
const previousDescription = ref(null);
const filter = ref('all');

const filters = [
  { key: 'all', label: 'All' },
  { key: PENDING, label: 'Pending' },
  { key: OVERDUE, label: 'Overdue' },
  { key: COMPLETED, label: 'Completed' },
];

const decorated = computed(() => props.tasks.map((task) => ({ task, status: taskStatus(task) })));

const counts = computed(() => {
  const result = { all: decorated.value.length, [PENDING]: 0, [OVERDUE]: 0, [COMPLETED]: 0 };
  for (const item of decorated.value) {
    result[item.status] += 1;
  }
  return result;
});

const visible = computed(() => {
  if (filter.value === 'all') {
    return decorated.value;
  }
  return decorated.value.filter((item) => item.status === filter.value);
});

const canSuggest = computed(() => form.title.trim() !== '' || form.description.trim() !== '');

async function submitCreate() {
  formError.value = '';
  const payload = { description: form.description.trim() };
  if (form.title.trim() !== '') {
    payload.title = form.title.trim();
  }
  if (form.finishDate.trim() !== '') {
    payload.finishDate = form.finishDate.trim();
  }
  const result = createTaskInput.safeParse(payload);
  if (!result.success) {
    formError.value = firstIssue(result.error);
    return;
  }
  creating.value = true;
  try {
    const task = await api.post(`/api/projects/${props.project.id}/tasks`, result.data);
    form.title = '';
    form.description = '';
    form.finishDate = '';
    previousDescription.value = null;
    emit('task-created', task);
    await nextTick();
    titleInput.value?.focus();
  } catch (error) {
    if (error instanceof ApiError && error.code !== 'unauthenticated') {
      formError.value = error.message;
    }
  } finally {
    creating.value = false;
  }
}

async function suggest() {
  const payload = {};
  if (form.title.trim() !== '') {
    payload.title = form.title.trim();
  }
  if (form.description.trim() !== '') {
    payload.description = form.description.trim();
  }
  const result = suggestInput.safeParse(payload);
  if (!result.success) {
    formError.value = firstIssue(result.error);
    return;
  }
  suggesting.value = true;
  try {
    const response = await api.post('/api/ai/suggest', result.data);
    previousDescription.value = form.description;
    form.description = response.suggestion;
  } catch (error) {
    if (error instanceof ApiError && error.code !== 'unauthenticated') {
      emit('toast', { message: error.message, type: 'error' });
    }
  } finally {
    suggesting.value = false;
  }
}

function undoSuggestion() {
  if (previousDescription.value !== null) {
    form.description = previousDescription.value;
    previousDescription.value = null;
  }
}

function getDraft() {
  return { ...form };
}

function setDraft(draft) {
  if (!draft) {
    return;
  }
  form.title = draft.title ?? '';
  form.description = draft.description ?? '';
  form.finishDate = draft.finishDate ?? '';
}

defineExpose({ getDraft, setDraft });
</script>

<template>
  <section class="task-panel">
    <h2>{{ project.name }}</h2>
    <form class="task-form" @submit.prevent="submitCreate">
      <div class="field">
        <label for="task-title">Title (optional)</label>
        <input id="task-title" ref="titleInput" v-model="form.title" type="text" maxlength="80" />
      </div>
      <div class="field">
        <label for="task-description">Description</label>
        <textarea id="task-description" v-model="form.description" rows="2" maxlength="500"></textarea>
        <p class="hint">
          {{ form.description.length }}/500
          <a v-if="previousDescription !== null" href="#" class="undo-link" @click.prevent="undoSuggestion">Undo</a>
        </p>
        <p v-if="previousDescription !== null" class="hint-muted">
          Draft from the sample assistant — yours to edit.
        </p>
      </div>
      <div class="field">
        <label for="task-date">Finish date (optional)</label>
        <input id="task-date" v-model="form.finishDate" type="date" />
      </div>
      <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>
      <div class="form-actions">
        <button type="button" class="ghost-button" :disabled="suggesting || !canSuggest" @click="suggest">
          {{ suggesting ? 'Thinking…' : 'Suggest' }}
        </button>
        <button type="submit" class="primary-button" :disabled="creating">
          {{ creating ? 'Adding…' : 'Add task' }}
        </button>
      </div>
    </form>

    <div class="filters" role="group" aria-label="Filter tasks">
      <button
        v-for="item in filters"
        :key="item.key"
        type="button"
        class="filter-button"
        :class="{ active: filter === item.key }"
        :aria-pressed="filter === item.key"
        @click="filter = item.key"
      >
        {{ item.label }} ({{ counts[item.key] }})
      </button>
    </div>

    <p v-if="loading" class="hint">Loading…</p>
    <p v-else-if="tasks.length === 0" class="empty-state">
      No tasks yet — try the Suggest button above for a starting point.
    </p>
    <p v-else-if="visible.length === 0" class="empty-state">No tasks match this filter.</p>
    <ul v-else class="task-list">
      <TaskItem
        v-for="item in visible"
        :key="item.task.id"
        :task="item.task"
        :status="item.status"
        :busy="busyTaskId === item.task.id"
        @complete="emit('complete', item.task)"
        @edit="emit('edit', item.task)"
        @delete="emit('delete', item.task)"
      />
    </ul>
  </section>
</template>
