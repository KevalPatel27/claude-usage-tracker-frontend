export const metadata = { title: 'Administration' };
import { Suspense } from "react";
import { Administration } from "@/components/tracker";
export default function Page(){return <Suspense fallback={<p role="status">Loading…</p>}><Administration/></Suspense>;}
