// src/lib/advisorThreadLocal.js
const KEY = "hl_advisor_thread_v1";

export function readAdvisorThread() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeAdvisorThread(thread) {
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.isArray(thread) ? thread : []));
  } catch {
    // noop
  }
}

export function clearAdvisorThread() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // noop
  }
}
