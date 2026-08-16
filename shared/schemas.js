// One set of zod schemas, imported by the server (request validation) and the
// browser (instant form feedback). The server always re-validates.
import { z } from 'zod';

export const DESCRIPTION_MAX = 500;
export const NAME_MAX = 80;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200; // every candidate password costs a scrypt derivation

const text = (max, thing) =>
  z
    .string({ error: `${thing} must be text` })
    .trim()
    .min(1, { error: `${thing} cannot be empty` })
    .max(max, { error: `${thing} must be ${max} characters or fewer` });

const password = z
  .string({ error: 'A password must be text' })
  .min(PASSWORD_MIN, { error: `Password must be at least ${PASSWORD_MIN} characters` })
  .max(PASSWORD_MAX, { error: `Password must be ${PASSWORD_MAX} characters or fewer` });

export const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'A valid email address is required' }))
  .pipe(z.string().max(200));

export const registerInput = z.object({ email: emailAddress, password }).strict();

// Login checks shape only (never "too short to be ours") — but the length cap stays,
// so a huge password cannot buy a huge scrypt derivation.
export const loginInput = z
  .object({ email: z.string().trim().toLowerCase().max(200), password: z.string().max(PASSWORD_MAX) })
  .strict();

export const changePasswordInput = z
  .object({ currentPassword: z.string().max(PASSWORD_MAX), newPassword: password })
  .strict();

export const deleteAccountInput = z.object({ password: z.string().max(PASSWORD_MAX) }).strict();

// `.strict()` is the security-relevant part: ids, ownership and completion are the
// server's to decide, so an unknown key is a rejected request, never a silent ignore.
export const createProjectInput = z.object({ name: text(NAME_MAX, 'A project name') }).strict();
export const updateProjectInput = createProjectInput;

export const createTaskInput = z
  .object({
    title: text(NAME_MAX, 'A title').optional(),
    description: text(DESCRIPTION_MAX, 'A description'),
    finishDate: z.iso.date({ error: 'Must be a calendar date (YYYY-MM-DD)' }).optional(),
  })
  .strict();

// Any subset; null removes an optional field; an empty patch is refused.
export const updateTaskInput = z
  .object({
    title: text(NAME_MAX, 'A title').nullable().optional(),
    description: text(DESCRIPTION_MAX, 'A description').optional(),
    finishDate: z.iso.date({ error: 'Must be a calendar date (YYYY-MM-DD)' }).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { error: 'Provide at least one field to update' });

export const suggestInput = z
  .object({
    title: text(NAME_MAX, 'A title').optional(),
    description: text(DESCRIPTION_MAX, 'A description').optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    error: 'Provide a title or a rough description to expand',
  });

export function firstIssue(error) {
  return error.issues[0].message;
}
