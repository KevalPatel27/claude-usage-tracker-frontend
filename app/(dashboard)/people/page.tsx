export const metadata = { title: 'People & devices' };
import { Suspense } from "react";
import { People } from "@/components/tracker";
export default function Page(){return <Suspense fallback={<p role="status">Loading…</p>}><People/></Suspense>;}
