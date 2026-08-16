<script setup>
import { reactive, ref } from 'vue';
import { loginInput, registerInput } from 'shared/schemas.js';
import { api, ApiError } from './api.js';

const emit = defineEmits(['authenticated', 'toast']);

const mode = ref('login');
const form = reactive({ email: '', password: '', confirmPassword: '' });
const showPassword = ref(false);
const errors = reactive({});
const submitting = ref(false);

function toggleMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login';
  errors.email = undefined;
  errors.password = undefined;
  errors.confirmPassword = undefined;
}

function validate() {
  for (const key of Object.keys(errors)) {
    delete errors[key];
  }
  const schema = mode.value === 'login' ? loginInput : registerInput;
  const result = schema.safeParse({ email: form.email, password: form.password });
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors[issue.path[0]] = issue.message;
    }
  }
  if (mode.value === 'register' && form.password !== form.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match';
  }
  return Object.keys(errors).length === 0;
}

async function submit() {
  if (!validate() || submitting.value) {
    return;
  }
  submitting.value = true;
  try {
    if (mode.value === 'register') {
      await api.post('/auth/register', { email: form.email, password: form.password });
    }
    // Register has no token in its response, so log in right after — this is
    // the auto-login step for a fresh account.
    const result = await api.post('/auth/login', { email: form.email, password: form.password });
    emit('authenticated', result);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
    emit('toast', { message, type: 'error' });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="auth-screen">
    <div class="auth-card">
      <h1>Task Manager</h1>
      <p class="auth-subtitle">{{ mode === 'login' ? 'Sign in to your account' : 'Create a new account' }}</p>
      <form @submit.prevent="submit" novalidate>
        <div class="field">
          <label for="email">Email</label>
          <input
            id="email"
            v-model="form.email"
            type="email"
            autocomplete="email"
            :aria-invalid="Boolean(errors.email)"
          />
          <p v-if="errors.email" class="field-error" role="alert">{{ errors.email }}</p>
        </div>
        <div class="field">
          <label for="password">Password</label>
          <div class="password-row">
            <input
              id="password"
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
              :aria-invalid="Boolean(errors.password)"
            />
            <button type="button" class="ghost-button" @click="showPassword = !showPassword">
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
          <p v-if="errors.password" class="field-error" role="alert">{{ errors.password }}</p>
        </div>
        <div v-if="mode === 'register'" class="field">
          <label for="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            v-model="form.confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            :aria-invalid="Boolean(errors.confirmPassword)"
          />
          <p v-if="errors.confirmPassword" class="field-error" role="alert">{{ errors.confirmPassword }}</p>
        </div>
        <button type="submit" class="primary-button full-width" :disabled="submitting">
          {{ submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account' }}
        </button>
      </form>
      <button type="button" class="link-button" @click="toggleMode">
        {{ mode === 'login' ? 'Need an account? Create one' : 'Have an account? Sign in' }}
      </button>
    </div>
  </div>
</template>
