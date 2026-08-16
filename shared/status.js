// Task status is derived at read time, never stored. All comparisons happen on
// LOCAL calendar days — including completedAt, which is stored as a UTC instant
// and converted to the viewer's local day here. That conversion is the fix for a
// real bug: comparing a UTC date string against a local finish date brands a
// late-evening completion "late" one timezone too early.
export const PENDING = 'pending';
export const OVERDUE = 'overdue';
export const COMPLETED = 'completed';

export function localDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function taskStatus(task, today = localDay()) {
  if (task.completed) {
    return COMPLETED;
  }
  if (task.finishDate && task.finishDate < today) {
    return OVERDUE;
  }
  return PENDING;
}

// True when the work was finished after the local day it was due.
export function wasLate(task) {
  if (!task.completed || !task.finishDate || !task.completedAt) {
    return false;
  }
  return localDay(task.completedAt) > task.finishDate;
}
