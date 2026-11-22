'use client';

/**
 * Collapsed/expanded state of the navigation rail.
 *
 * The choice belongs to the student and must survive navigation, so it lives
 * in localStorage. An external store (rather than component state) keeps the
 * sidebar and the content offset in sync without a context provider, and
 * `useSyncExternalStore` renders the expanded rail on the server and settles
 * to the stored value on the client without a hydration warning.
 */
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'darsak-nav-collapsed';

const listeners = new Set<() => void>();
let cached: boolean | null = null;

function read(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function getCollapsedSnapshot(): boolean {
  if (cached === null) cached = read();
  return cached;
}

/** Server and first client render agree on the expanded rail. */
export function getCollapsedServerSnapshot(): boolean {
  return false;
}

export function subscribeCollapsed(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab toggling the rail should move this one too.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cached = read();
    emit();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function setCollapsed(next: boolean): void {
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    /* storage unavailable — this visit still keeps the rail state */
  }
  emit();
}

export function useNavCollapsed(): boolean {
  return useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    getCollapsedServerSnapshot,
  );
}
