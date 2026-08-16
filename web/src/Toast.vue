<script setup>
import { ref, watch } from 'vue';

// `id` is bumped by the caller on every notify() so repeated identical
// messages still retrigger the visible/auto-hide cycle.
const props = defineProps({
  message: { type: String, default: '' },
  type: { type: String, default: 'success' },
  id: { type: Number, default: 0 },
});

const visible = ref(false);
let timer = null;

watch(
  () => props.id,
  () => {
    if (!props.message) {
      return;
    }
    visible.value = true;
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      visible.value = false;
    }, 3500);
  }
);
</script>

<template>
  <div class="toast" :class="[type, { visible }]" role="status" aria-live="polite">
    {{ message }}
  </div>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 1.5rem;
  transform: translate(-50%, 1rem);
  padding: 0.75rem 1.25rem;
  border-radius: var(--radius);
  background: var(--color-surface-raised);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-lifted);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
  z-index: 100;
  max-width: min(90vw, 26rem);
}

.toast.visible {
  opacity: 1;
  transform: translate(-50%, 0);
}

.toast.error {
  border-color: var(--color-danger);
  color: var(--color-danger);
}
</style>
