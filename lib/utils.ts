import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy');
  } catch {
    return '—';
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy HH:mm');
  } catch {
    return '—';
  }
}

export function formatRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
  } catch {
    return '—';
  }
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function tokenTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    input: 'Input',
    output: 'Output',
    cacheRead: 'Cache read',
    cacheCreation: 'Cache write',
  };
  return labels[type] ?? type;
}

export const TOKEN_TYPE_COLORS: Record<string, string> = {
  input: '#3b82f6',         // blue-500
  output: '#8b5cf6',        // violet-500
  cacheRead: '#10b981',     // emerald-500
  cacheCreation: '#f59e0b', // amber-500
};

export function getTotalTokensByType(
  totalsByType: Array<{ _id: string; total: number }>
) {
  const map: Record<string, number> = {};
  for (const t of totalsByType) map[t._id] = t.total;
  return map;
}
