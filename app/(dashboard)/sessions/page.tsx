import { Suspense } from 'react';
import { HistoryWorkspace } from '@/components/history-workspace';
import { LoadingState } from '@/components/loading-state';
export const metadata = { title: 'Sessions & prompts' };
export default function Page() { return <Suspense fallback={<LoadingState label="Loading prompt history…"/>}><HistoryWorkspace/></Suspense>; }
