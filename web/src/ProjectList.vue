<script setup>
import { ref } from 'vue';
import { createProjectInput, updateProjectInput, firstIssue } from 'shared/schemas.js';

const props = defineProps({
  projects: { type: Array, default: () => [] },
  selectedId: { default: null },
  loading: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
});
const emit = defineEmits(['select', 'create', 'rename', 'delete']);

const newName = ref('');
const createError = ref('');
const editingId = ref(null);
const editValue = ref('');
const editError = ref('');

function submitCreate() {
  const result = createProjectInput.safeParse({ name: newName.value.trim() });
  if (!result.success) {
    createError.value = firstIssue(result.error);
    return;
  }
  createError.value = '';
  emit('create', result.data.name);
  newName.value = '';
}

function startEdit(project) {
  editingId.value = project.id;
  editValue.value = project.name;
  editError.value = '';
}

function cancelEdit() {
  editingId.value = null;
  editError.value = '';
}

function confirmEdit(project) {
  const result = updateProjectInput.safeParse({ name: editValue.value.trim() });
  if (!result.success) {
    editError.value = firstIssue(result.error);
    return;
  }
  emit('rename', project.id, result.data.name);
  editingId.value = null;
}
</script>

<template>
  <section class="project-list">
    <h2>Projects</h2>
    <form class="create-form" @submit.prevent="submitCreate">
      <label for="new-project" class="visually-hidden">New project name</label>
      <input id="new-project" v-model="newName" type="text" maxlength="80" placeholder="New project name" />
      <button type="submit" class="primary-button" :disabled="busy">Add</button>
    </form>
    <p v-if="createError" class="field-error" role="alert">{{ createError }}</p>

    <p v-if="loading" class="hint">Loading…</p>
    <p v-else-if="projects.length === 0" class="empty-state">
      Create your first project above — try "Birthday party".
    </p>
    <ul v-else class="projects">
      <li v-for="project in projects" :key="project.id" class="project-row" :class="{ active: project.id === selectedId }">
        <template v-if="editingId === project.id">
          <input
            v-model="editValue"
            type="text"
            maxlength="80"
            class="rename-input"
            :disabled="busy"
            @keyup.enter="confirmEdit(project)"
            @keyup.escape="cancelEdit"
          />
        </template>
        <button v-else type="button" class="project-name" @click="emit('select', project.id)">
          {{ project.name }}
        </button>
        <div class="project-actions">
          <button
            v-if="editingId !== project.id"
            type="button"
            class="icon-button"
            aria-label="Rename project"
            @click="startEdit(project)"
          >
            ✎
          </button>
          <button
            v-if="editingId === project.id"
            type="button"
            class="icon-button"
            aria-label="Confirm rename"
            :disabled="busy"
            @click="confirmEdit(project)"
          >
            ✓
          </button>
          <button type="button" class="icon-button" aria-label="Delete project" @click="emit('delete', project)">
            🗑
          </button>
        </div>
        <p v-if="editingId === project.id && editError" class="field-error" role="alert">{{ editError }}</p>
      </li>
    </ul>
  </section>
</template>
