export interface PromptRow {
  _id: string; deviceId: string; sessionId: string; promptId: string;
  personName: string; deviceName: string; project: string;
  promptPreview: string; promptText?: string | null; promptLength: number | null;
  truncated: boolean; submittedAt: string | null; completedAt: string | null; durationMs: number | null;
}
export interface HistoryData {
  rows: PromptRow[]; page: number; hasMore: boolean;
  stats: { records: number; prompts: number; sessions: number; averageLength: number | null; averageDurationMs: number | null; completed: number; incomplete: number };
  daily: Array<{ _id: string; prompts: number; averageDurationMs: number | null; completed: number }>;
  lengths: Array<{ _id: number | string; prompts: number }>;
  projects: Array<{ _id: string; prompts: number }>;
  period: { from: string; to: string; timezone: string }; retentionDays: number; generatedAt: string;
}
export interface HistorySession {
  device: { _id: string; name: string; promptCollectionEnabled: boolean; lastHistoryReportAt: string | null };
  project: string; rows: PromptRow[]; page: number; hasMore: boolean; total: number; retentionDays: number;
  period: { from: string; to: string; timezone: string };
}
export interface HistoryDiagnostics {
  devices: Array<{ _id: string; name: string; personId: { _id: string; name: string } | null; revokedAt: string | null; archivedAt: string | null;
    promptCollectionEnabled: boolean; lastReportAt: string | null; lastHistoryReportAt: string | null;
    historySetupVersion: string | null; historyPlatform: string | null; historyPendingCount: number | null; historyDroppedCount: number | null }>;
  truncated: boolean; requiredSetupVersion: string; retentionDays: number; generatedAt: string;
}
export function turnDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return 'Not available';
  if (ms < 1000) return '<1 sec';
  if (ms < 60000) return Math.round(ms / 1000) + ' sec';
  if (ms < 3600000) return (ms / 60000).toFixed(ms < 600000 ? 1 : 0) + ' min';
  return (ms / 3600000).toFixed(1) + ' hr';
}
