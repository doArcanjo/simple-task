<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: 'Are you sure?' },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Delete' },
  busy: { type: Boolean, default: false },
});
const emit = defineEmits(['confirm', 'cancel']);

const dialog = ref(null);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      dialog.value?.showModal();
    } else {
      dialog.value?.close();
    }
  }
);
</script>

<template>
  <dialog ref="dialog" class="app-dialog" @cancel="emit('cancel')">
    <h2>{{ title }}</h2>
    <p>{{ message }}</p>
    <div class="dialog-actions">
      <button type="button" class="ghost-button" :disabled="busy" @click="emit('cancel')">Cancel</button>
      <button type="button" class="danger-button" :disabled="busy" @click="emit('confirm')">
        {{ busy ? 'Working…' : confirmLabel }}
      </button>
    </div>
  </dialog>
</template>
