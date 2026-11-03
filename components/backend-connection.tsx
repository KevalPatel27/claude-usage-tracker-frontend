"use client";
import { useEffect, useState } from 'react';

const INTERVAL_MS=5*60_000,TIMEOUT_MS=75_000,RETRY_MS=30_000;
type State='checking'|'connected'|'unavailable'|'offline';

/** Browser-based best effort only: this cannot run after the tab/browser is suspended. */
export function BackendConnection(){
 const [state,setState]=useState<State>('checking'),[lastChecked,setLastChecked]=useState<string|null>(null),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let active=true,busy=false,failures=0,timer:ReturnType<typeof setTimeout>|undefined,timeout:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined;
  async function ping(){
   if(!active||busy)return;clearTimeout(timer);
   if(!navigator.onLine){setState('offline');timer=setTimeout(()=>void ping(),INTERVAL_MS);return;}
   busy=true;setState('checking');controller=new AbortController();timeout=setTimeout(()=>controller?.abort(),TIMEOUT_MS);
   try{
    // Same-origin rewrite goes to the backend's real /health, with no cookies or device keys.
    const response=await fetch('/api/backend-health',{cache:'no-store',credentials:'omit',signal:controller.signal});
    if(!response.ok)throw Error('Health unavailable');
    const health=await response.json();if(health.status!=='ok'||health.db!==1)throw Error('Backend not ready');
    if(active){setState('connected');setLastChecked(new Date().toISOString());failures=0;}
   }catch{if(active){setState(navigator.onLine?'unavailable':'offline');failures++;}}
   finally{clearTimeout(timeout);busy=false;if(active)timer=setTimeout(()=>void ping(),failures>0&&failures<=3?RETRY_MS:INTERVAL_MS);}
  }
  const wake=()=>{if(active&&!busy)void ping();};
  const visible=()=>{if(document.visibilityState==='visible')wake();};
  const offline=()=>{setState('offline');controller?.abort();};
  timer=setTimeout(()=>void ping(),0);window.addEventListener('online',wake);window.addEventListener('offline',offline);document.addEventListener('visibilitychange',visible);
  return()=>{active=false;clearTimeout(timer);clearTimeout(timeout);controller?.abort();window.removeEventListener('online',wake);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',visible);};
 },[retry]);
 const label={checking:'Checking backend…',connected:'Backend connected',unavailable:'Backend unavailable',offline:'Browser offline'}[state];
 const title=`Health check every 5 minutes while this dashboard tab runs. ${lastChecked?'Last successful check: '+new Date(lastChecked).toLocaleString()+'. ':''}Closed or suspended tabs cannot keep the backend awake. Click to check again.`;
 return <button type="button" className={'backend-connection '+state} title={title} onClick={()=>setRetry(n=>n+1)} aria-label={label+'. Check again'}><i aria-hidden="true"/><span role="status" aria-live="polite">{label}</span></button>;
}
