// Shared API client — talks to Next.js /api proxy, which forwards to backend
// Credentials are sent as HTTP-only cookies; no tokens in localStorage.

const BASE = '/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener('abort', cancel, { once: true });
  // Allow time for a free backend to wake, but never leave the UI waiting forever.
  const writing = !['GET', 'HEAD'].includes((options.method ?? 'GET').toUpperCase());
  const timeout = setTimeout(() => controller.abort(new Error(writing ? 'Request timed out. Check whether your change was saved before trying again.' : 'Request timed out. The backend may be waking up. Try again.')), 90000);
  try {
    const headers = new Headers(options.headers);
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const res = await fetch(`${BASE}${path}`, {
      ...options, credentials: 'include', cache: 'no-store', headers, signal: controller.signal,
    });
    if (!res.ok) {
      let message = res.status === 401 ? 'Your admin session expired. Sign in again.' : `Request failed (HTTP ${res.status}). Try again.`;
      try {
        const body = await res.json();
        if (typeof body.error === 'string') message = body.error;
      } catch {}
      throw new ApiError(res.status, message);
    }
    if (res.status === 204) return undefined as T;
    return await res.json() as T;
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof TypeError) throw new Error(writing ? 'Connection lost. Check whether your change was saved before trying again.' : 'Cannot reach the server. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (username: string, password: string) =>
    apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => apiFetch('/auth/logout', { method: 'POST' }),

  me: () => apiFetch<{ adminId: string }>('/auth/me'),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface ModelPrice {
  id: string; name: string; aliases: string[]; note?: string; overridden: boolean;
  rates: Record<'input'|'output'|'cacheRead'|'cacheCreation',number> | null;
  longPromptRates?: Record<'input'|'output'|'cacheRead'|'cacheCreation',number>;
}
export interface OverviewData {
  dataMode: string;
  period: { from: string; to: string; timezone: string };
  trendGranularity: 'hour' | 'day';
  trend: Array<{ at: string; totalTokens: number; input: number; output: number; cacheRead: number; cacheCreation: number; estimatedCostUsd: number | null }>;
  costByModel: Array<{ model: string; estimatedCostUsd: number | null }>;
  pricing: { source: string | null; verifiedAt: string | null; basis: string; unpricedModels: string[]; configurationError: string | null; catalog?: ModelPrice[]; overrideSource?: string | null; overrideVerifiedAt?: string | null; overrideBasis?: string | null };
  totalsByType: Array<{ _id: string; total: number }>;
  byPerson: Array<{
    personId: string;
    personName: string;
    totalTokens: number;
    breakdown: Array<{ tokenType: string; total: number }>;
  }>;
  dailyTrend: Array<{ _id: string; totalTokens: number }>;
  deviceCount: number;
  lastReportAt: string | null;
  generatedAt: string;
  recordCount: number;
  estimatedCostUsd: number | null;
  byDevice: Array<{ _id: string; deviceName: string; totalTokens: number }>;
  byModel: Array<{ _id: { model: string; tokenType: string }; totalTokens: number }>;
}

export interface CollectionStatus {
  devices: Array<{
    deviceId: string;
    deviceName: string;
    personName: string | null;
    lastReportAt: string | null;
    status: 'recent' | 'stale' | 'never' | 'revoked';
    keyPrefix: string;
  }>;
  generatedAt: string;
}

export const dashboardApi = {
  overview: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return apiFetch<OverviewData>(`/dashboard/overview?${params}`);
  },

  collectionStatus: () => apiFetch<CollectionStatus>('/dashboard/collection-status'),

  verifyDevice: (deviceId: string) =>
    apiFetch<{
      verified: boolean;
      lastReportAt: string | null;
      recentReport: { exportedAt: string; model: string; tokenType: string; deltaTokens: number } | null;
    }>(`/dashboard/verify-device/${deviceId}`),

  settings: () =>
    apiFetch<{ reportingTimezone: string; dataRetentionDays: number; version: string }>(
      '/dashboard/settings'
    ),
};

// ─── People ───────────────────────────────────────────────────────────────────

export interface Person {
  _id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  notes?: string;
  archivedAt?: string | null;
  deleteReason?: string | null;
  devices?: Device[];
}

export const peopleApi = {
  list: (includeArchived = false) => apiFetch<Person[]>(`/people?includeArchived=${includeArchived}`),
  create: (name: string) =>
    apiFetch<Person>('/people', { method: 'POST', body: JSON.stringify({ name }) }),
  rename: (id: string, name: string) =>
    apiFetch<Person>(`/people/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  usage: (id: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return apiFetch<{
      person: Person;
      records: Array<{ _id: { usageModel: string; tokenType: string; deviceId: string }; totalTokens: number }>;
    }>(`/people/${id}/usage?${params}`);
  },
  exportCsv: (id: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return `/api/people/${id}/export.csv?${params}`;
  },
};

// ─── Devices ──────────────────────────────────────────────────────────────────

export interface Device {
  _id: string;
  name: string;
  keyPrefix: string;
  personId: string | { _id: string; name: string } | null;
  lastReportAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  notes?: string;
  archivedAt?: string | null;
  deleteReason?: string | null;
  assignments?: Array<{ personId: string | { _id: string; name: string }; assignedAt: string; revokedAt?: string }>;
}

export const devicesApi = {
  list: (includeArchived = false) => apiFetch<Device[]>(`/devices?includeArchived=${includeArchived}`),

  get: (id: string) => apiFetch<Device>(`/devices/${id}`),

  create: (name: string, personId?: string, promptCollectionEnabled = false) =>
    apiFetch<{ device: Device; rawKey: string; warning: string }>('/devices', {
      method: 'POST',
      body: JSON.stringify({ name, personId, promptCollectionEnabled }),
    }),

  rename: (id: string, name: string) =>
    apiFetch<Device>(`/devices/${id}/name`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  assign: (id: string, personId: string) =>
    apiFetch(`/devices/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ personId }),
    }),

  rotateKey: (id: string) =>
    apiFetch<{ rawKey: string; warning: string }>(`/devices/${id}/rotate-key`, {
      method: 'POST',
    }),

  revoke: (id: string) =>
    apiFetch(`/devices/${id}/revoke`, { method: 'POST' }),

  usage: (id: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return apiFetch<{
      records: Array<{ _id: { usageModel: string; tokenType: string }; totalTokens: number }>;
    }>(`/devices/${id}/usage?${params}`);
  },

  exportCsv: (id: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return `/api/devices/${id}/export.csv?${params}`;
  },
};
