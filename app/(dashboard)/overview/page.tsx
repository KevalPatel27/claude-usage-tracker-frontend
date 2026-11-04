export const metadata = { title: 'Usage overview' };
import { LoadingState } from '@/components/loading-state';
import { Suspense } from "react";
import { Overview } from "@/components/tracker";
export default function Page(){return <Suspense fallback={<LoadingState label="Loading recorded usage…"/>}><Overview/></Suspense>;}
