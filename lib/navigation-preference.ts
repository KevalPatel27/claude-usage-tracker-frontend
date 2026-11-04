'use client';
import { useSyncExternalStore } from 'react';

const key = 'usage-ledger.sidebar.collapsed';
const event = 'usage-ledger-navigation-change';
let fallback = false;
let override: boolean | null = null;
function snapshot() {
  if (override !== null) return override;
  try { const saved = localStorage.getItem(key); return saved === null ? false : saved === 'true'; }
  catch { return fallback; }
}
function subscribe(update: () => void) {
  const storage = (change: StorageEvent) => { if (change.key === key || change.key === null) { override = null; update(); } };
  window.addEventListener('storage', storage);
  window.addEventListener(event, update);
  return () => { window.removeEventListener('storage', storage); window.removeEventListener(event, update); };
}
export function useCollapsedNavigation() {
  const collapsed = useSyncExternalStore(subscribe, snapshot, () => false);
  function toggle() {
    fallback = !snapshot();
    try { localStorage.setItem(key, String(fallback)); override = null; } catch { override = fallback; }
    window.dispatchEvent(new Event(event));
  }
  return [collapsed, toggle] as const;
}
