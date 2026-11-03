export const metadata = { title: 'Usage overview' };
import { Suspense } from "react";
import { Overview } from "@/components/tracker";
export default function Page(){return <Suspense fallback={<p role="status">Loading…</p>}><Overview/></Suspense>;}
