import { Suspense } from 'react';
import { SessionHistoryDetail } from '@/components/session-history-detail';
import { LoadingState } from '@/components/loading-state';
export const metadata = { title: 'Session details' };
export default async function Page({ params }: { params: Promise<{ deviceId: string; sessionId: string }> }) {
  const { deviceId, sessionId } = await params;
  return <Suspense fallback={<LoadingState label="Loading session…"/>}><SessionHistoryDetail deviceId={deviceId} sessionId={sessionId}/></Suspense>;
}
