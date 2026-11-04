export const metadata = { title: 'Connect a PC' };
import { Connect } from "@/components/connect";
export default async function Page({searchParams}:{searchParams:Promise<{deviceId?:string;personId?:string;history?:string}>}){
 const {deviceId,personId,history}=await searchParams;
 let backendUrl = '';
 try { const url = new URL(process.env.PUBLIC_INGESTION_URL || process.env.BACKEND_URL || ''); if (['http:', 'https:'].includes(url.protocol)) backendUrl = url.origin; } catch {}
 return <Connect backendUrl={backendUrl} initialDeviceId={deviceId} initialPersonId={personId} initialHistory={history==='1'}/>;
}
