<script setup>
import { reactive, ref, watch } from 'vue';
import { updateTaskInput, firstIssue } from 'shared/schemas.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  task: { default: null },
  busy: { type: Boolean, default: false },
});
const emit = defineEmits(['save', 'cancel']);

const dialog = ref(null);
const form = reactive({ title: '', description: '', finishDate: '' });
const error = ref('');

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      form.title = props.task?.title ?? '';
      form.description = props.task?.description ?? '';
      form.finishDate = props.task?.finishDate ?? '';
      error.value = '';
      dialog.value?.showModal();
    } else {
      dialog.value?.close();
    }
  }
);

function submit() {
  const patch = {
    title: form.title.trim() === '' ? null : form.title.trim(),
    description: form.description.trim(),
    finishDate: form.finishDate.trim() === '' ? null : form.finishDate.trim(),
  };
  const result = updateTaskInput.safeParse(patch);
  if (!result.success) {
    error.value = firstIssue(result.error);
    return;
  }
  emit('save', result.data);
}
</script>

<template>
  <dialog ref="dialog" class="app-dialog" @cancel="emit('cancel')">
    <h2>Edit task</h2>
    <form @submit.prevent="submit">
      <div class="field">
        <label for="edit-title">Title</label>
        <input id="edit-title" v-model="form.title" type="text" maxlength="80" />
      </div>
      <div class="field">
        <label for="edit-description">Description</label>
        <textarea id="edit-description" v-model="form.description" rows="4" maxlength="500"></textarea>
        <p class="hint">{{ form.description.length }}/500</p>
      </div>
      <div class="field">
        <label for="edit-date">Finish date</label>
        <input id="edit-date" v-model="form.finishDate" type="date" />
      </div>
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button type="button" class="ghost-button" :disabled="busy" @click="emit('cancel')">Cancel</button>
        <button type="submit" class="primary-button" :disabled="busy">{{ busy ? 'Saving…' : 'Save' }}</button>
      </div>
    </form>
  </dialog>
</template>
