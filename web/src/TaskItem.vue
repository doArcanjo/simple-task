<script setup>
import { wasLate } from 'shared/status.js';

const props = defineProps({
  task: { type: Object, required: true },
  status: { type: String, required: true },
  busy: { type: Boolean, default: false },
});
defineEmits(['complete', 'edit', 'delete']);

function formatDate(value) {
  if (!value) {
    return '';
  }
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function formatDateTime(value) {
  return new Date(value).toLocaleString();
}
</script>

<template>
  <li class="task-item" :class="status">
    <div class="task-main">
      <p class="task-title">{{ task.title || task.description.slice(0, 60) }}</p>
      <p v-if="task.title" class="task-description">{{ task.description }}</p>
      <div class="task-meta">
        <span class="badge" :class="status">{{ status }}</span>
        <span v-if="status === 'completed' && wasLate(task)" class="badge late">delivered late</span>
        <span
          v-if="task.finishDate"
          class="finish-date"
          :title="`Due ${formatDate(task.finishDate)} (local time)`"
        >
          Due {{ formatDate(task.finishDate) }}
        </span>
        <span v-if="task.completed" class="completed-at">Completed {{ formatDateTime(task.completedAt) }}</span>
      </div>
    </div>
    <div v-if="!task.completed" class="task-actions">
      <button type="button" class="ghost-button" :disabled="busy" @click="$emit('edit', task)">Edit</button>
      <button type="button" class="primary-button small" :disabled="busy" @click="$emit('complete', task)">
        {{ busy ? 'Working…' : 'Complete' }}
      </button>
      <button type="button" class="danger-button" :disabled="busy" @click="$emit('delete', task)">Delete</button>
    </div>
  </li>
</template>
