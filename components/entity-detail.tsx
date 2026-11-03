"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Archive, Download, KeyRound, Monitor, Pencil, RotateCcw, ShieldOff, Users, X, RefreshCw } from 'lucide-react';
import { apiFetch, peopleApi, type Device, type Person, type OverviewData } from '@/lib/api';
import { Heading, ErrorBox } from './shared';
import { SessionUsage } from './session-usage';
import { DeleteRecord } from './delete-record';
import { PricingWarnings } from './price-catalog';
import { KeyNotice } from './device-key';
import { UsageTrend, TokenMix, count, money } from './usage-charts';

type Profile = Person & Partial<Device>;
type Action = 'edit' | 'assign' | 'archive' | 'restore' | 'revoke' | 'rotate-key' | 'reactivate';
const descriptions: Record<string,string> = {
 archive:'Remove this record from the active directory. Recorded usage and assignments remain available. Archiving a device immediately revokes its key.',
 restore:'Return this record to the active directory. Device reporting stays revoked until you generate and install a new key.',
 revoke:'Stop accepting reports from this device. Existing usage remains available.',
 'rotate-key':'Immediately replace the current key. Install the new key on this PC and restart Claude Desktop to resume reports.',
 reactivate:'Generate a new key to enable reporting. The previous key stays invalid. Install the new key on the PC and restart Claude Desktop.',
};
export function EntityDetail({kind,id}:{kind:'people'|'devices';id:string}) {
 const device=kind==='devices',noun=device?'device':'person',base=`/${kind}/${id}`,router=useRouter();
 const [profile,setProfile]=useState<Profile|null>(null),[people,setPeople]=useState<Person[]>([]),[usage,setUsage]=useState<OverviewData|null>(null);
 const [error,setError]=useState(''),[chartError,setChartError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[action,setAction]=useState<Action|null>(null),[actionError,setActionError]=useState(''),[key,setKey]=useState(''),[days,setDays]=useState('30'),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);
 const dialog=useRef<HTMLDialogElement>(null);
 const load=useCallback(async()=>{
   try {const [p,ps]=await Promise.all([apiFetch<Profile>(base),peopleApi.list(true)]);setProfile(p);setPeople(ps);setError('');}
   catch(e){setError(e instanceof Error?e.message:'Unable to load profile.');}finally{setLoading(false);}
 },[base]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 useEffect(()=>{let current=true;const timer=setTimeout(()=>{setUsage(null);setChartError('');const to=new Date(),from=new Date(to.getTime()-Number(days)*86400000);const q=new URLSearchParams({[device?'deviceId':'personId']:id,from:from.toISOString(),to:to.toISOString()});apiFetch<OverviewData>('/dashboard/overview?'+q).then(d=>{if(current)setUsage(d);}).catch(e=>{if(current)setChartError(e instanceof Error?e.message:'Unable to load usage.');});},0);return()=>{current=false;clearTimeout(timer);};},[device,id,days,refresh]);
 useEffect(()=>{if(action)dialog.current?.showModal();else dialog.current?.close();},[action]);
 function open(value:Action){setActionError('');setNotice('');setAction(value);}
 async function submit(e:FormEvent<HTMLFormElement>){
   e.preventDefault();if(!action)return;const form=new FormData(e.currentTarget);setBusy(true);setActionError('');
   try{
     const body=action==='edit'?{name:String(form.get('name')),notes:String(form.get('notes'))}:action==='assign'?{personId:form.get('personId')||null}:undefined;
     const result=await apiFetch<{rawKey?:string}>(base+(action==='edit'?'':'/'+action),{method:action==='edit'||action==='assign'?'PATCH':'POST',...(body?{body:JSON.stringify(body)}:{})});
     setAction(null);
     if(result?.rawKey)setKey(result.rawKey);setNotice(action==='edit'?'Profile saved.':action==='assign'?'Assignment updated. Historical usage keeps its previous assignment.':'Change saved.');await load();
   }catch(e){setActionError(e instanceof Error?e.message:'Unable to save. Try again.');}finally{setBusy(false);}
 }
 if(loading)return <p role="status">Loading {noun} details…</p>;
 if(!profile)return <><Link href="/people">← People & devices</Link><Heading title="Profile unavailable" description="It may have been removed, or the server is unavailable."/><ErrorBox error={error}/><button onClick={()=>void load()}>Retry</button></>;
 const assigned=typeof profile.personId==='object'?profile.personId:null;
 const total=usage?.totalsByType.reduce((n,r)=>n+r.total,0)??0;
 const exportQuery=new URLSearchParams({[device?'deviceId':'personId']:id,...(usage?{from:usage.period.from,to:usage.period.to,timezone:usage.period.timezone}:{})});
 return <>
 <Link className="back-link" href="/people"><ArrowLeft size={15}/>People & devices</Link>
 <Heading title={profile.name} description={device?'Device profile · configuration, reporting and assignment history':'Person profile · assigned devices and recorded usage'}><button onClick={()=>{void load();setRefresh(n=>n+1);}}><RefreshCw size={15}/>Refresh</button><button onClick={()=>open('edit')}><Pencil size={15}/>Edit profile</button><Link className="button primary" href={device?(profile.archivedAt||profile.revokedAt?'#manage-reporting':'/connect?deviceId='+id):profile.archivedAt?'#manage-reporting':'/connect?personId='+id}><Monitor size={16}/>{device?(profile.archivedAt||profile.revokedAt?'Manage reporting':'Verify reporting'):profile.archivedAt?'Manage person':'Connect a PC'}</Link></Heading>
 {error&&<ErrorBox error={error}/>} {notice&&<p className="success-notice" role="status">{notice}</p>}{key&&<KeyNotice value={key} clear={()=>setKey('')}/>}
 <div className="profile-layout"><section className="panel profile-card"><div className="profile-identity"><span className="directory-avatar">{device?<Monitor size={24}/>:profile.name.slice(0,1).toUpperCase()}</span><div><span className="eyebrow">{device?'Windows device':'Assigned person'}</span><h2>{profile.name}</h2></div><span className={'badge '+(profile.archivedAt||profile.revokedAt?'revoked':'recent')}>{profile.archivedAt?'Archived':profile.revokedAt?'Revoked':'Active'}</span></div>
 <dl className="profile-facts"><div><dt>Created</dt><dd>{new Date(profile.createdAt).toLocaleDateString()}</dd></div>{device?<><div><dt>Assigned person</dt><dd>{assigned?<Link href={'/people/'+assigned._id}>{assigned.name}</Link>:'Unassigned'}</dd></div><div><dt>Last report received</dt><dd>{profile.lastReportAt?new Date(profile.lastReportAt).toLocaleString():'No report received yet'}</dd></div><div><dt>Key prefix</dt><dd><code>{profile.keyPrefix}</code> · full keys are never displayed again</dd></div></>:<div><dt>Assigned devices</dt><dd>{profile.devices?.length??0}</dd></div>}</dl>
 <div className="profile-notes"><h3>Notes</h3><p>{profile.notes||'No notes added. Use Edit profile to add context.'}</p></div>
 {device&&<button disabled={!!profile.archivedAt} onClick={()=>open('assign')}><Users size={15}/>Change assignment</button>}
 </section><section className="panel profile-summary"><span className="eyebrow">Recorded usage</span><label>Reporting period<select value={days} onChange={e=>setDays(e.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>{usage?<><strong className="profile-total">{count(total)}</strong><p>tokens recorded · {usage.recordCount.toLocaleString()} observations</p><div className="profile-estimate"><span>Estimated API-equivalent cost</span><strong>{usage.estimatedCostUsd===null?'Unpriced':money(usage.estimatedCostUsd)}</strong><small>Separate from subscription billing.</small>{usage.estimatedCostUsd===null&&<small>No complete price estimate is available. {usage.pricing.unpricedModels.length>0&&<>Missing rates: {usage.pricing.unpricedModels.join(', ')}.</>}</small>}</div><a className="button" href={'/api/dashboard/export.csv?'+exportQuery}><Download size={15}/>Export this period</a></>:chartError?<ErrorBox error={chartError}/>:<p role="status">Loading recorded usage…</p>}</section></div>
 {usage&&<PricingWarnings data={usage}/>}
 {usage&&<div className="profile-charts"><UsageTrend data={usage}/><TokenMix data={usage}/></div>}
 {usage&&<SessionUsage key={exportQuery.toString()} query={exportQuery.toString()} refreshKey={usage.generatedAt}/>}
 {!device&&<section className="panel"><div className="section-title"><h2>Assigned devices</h2><span className="badge">{profile.devices?.length??0} devices</span></div>{profile.devices?.length?<div className="profile-device-list">{profile.devices.map(d=><Link href={'/devices/'+d._id} key={d._id}><Monitor size={20}/><span><strong>{d.name}</strong><small>{d.lastReportAt?'Last report '+new Date(d.lastReportAt).toLocaleString():'No report received yet'}</small></span><span className={'badge '+(d.archivedAt||d.revokedAt?'revoked':'recent')}>{d.archivedAt?'Archived':d.revokedAt?'Revoked':'Active'}</span></Link>)}</div>:<p>No devices currently assigned. Connect a PC to start collecting usage.</p>}<p className="footnote">Previously assigned usage stays with this person, even after a device is reassigned.</p></section>}
 {device&&<section className="panel"><h2>Assignment history</h2>{profile.assignments?.length?<ol className="assignment-timeline">{[...profile.assignments].reverse().map((a,i)=><li key={i}><strong>{typeof a.personId==='object'&&a.personId?<Link href={'/people/'+a.personId._id}>{a.personId.name}</Link>:'Previous assignment'}</strong><span>{new Date(a.assignedAt).toLocaleString()} → {a.revokedAt?new Date(a.revokedAt).toLocaleString():'Current assignment'}</span></li>)}</ol>:<p>No assignment history recorded.</p>}<p className="footnote">Assignments identify configured devices and their assigned people, not the actual human using a shared PC.</p></section>}
 <section id="manage-reporting" className="panel lifecycle-panel"><div><h2>Manage {noun}</h2><p>Archive records you no longer use. Usage and counter history stay intact.</p></div><div className="lifecycle-actions">{device&&!profile.archivedAt&&(profile.revokedAt?<button onClick={()=>open('reactivate')}><KeyRound size={15}/>Reactivate with new key</button>:<><button onClick={()=>open('rotate-key')}><KeyRound size={15}/>Rotate key</button><button onClick={()=>open('revoke')}><ShieldOff size={15}/>Revoke reporting</button></>)}<button onClick={()=>open(profile.archivedAt?'restore':'archive')}>{profile.archivedAt?<RotateCcw size={15}/>:<Archive size={15}/ >}{profile.archivedAt?'Restore '+noun:'Archive '+noun}</button><DeleteRecord kind={kind} id={id} name={profile.name} onDeleted={()=>router.push('/people')}/></div><p className="field-help">Permanent deletion erases usage across all dates. Archive preserves history.</p>{!device&&<p className="field-help">Before archiving a person, reassign, revoke or archive their active devices.</p>}</section>
 <dialog className="edit-dialog" ref={dialog} aria-labelledby="profile-dialog-title" onCancel={e=>{if(busy)e.preventDefault();else setAction(null);}}><form onSubmit={submit}><div className="section-title"><h2 id="profile-dialog-title">{action==='edit'?'Edit '+noun:action==='assign'?'Change assignment':action==='rotate-key'?'Rotate device key':action==='reactivate'?'Reactivate device':(action??'')+' '+noun}</h2><button type="button" className="icon-button" disabled={busy} aria-label="Close dialog" onClick={()=>setAction(null)}><X size={18}/></button></div>{actionError&&<ErrorBox error={actionError}/ >}{action==='edit'?<><label>{device?'Device name':'Person’s name'}<input name="name" defaultValue={profile.name} required maxLength={120} autoFocus/></label><label>Notes <span className="field-help">Optional · up to 2,000 characters</span><textarea name="notes" defaultValue={profile.notes??''} maxLength={2000} rows={4}/></label>{device&&<p className="field-help">Any recognizable label works; it does not need to match the Windows PC name.</p>}</>:action==='assign'?<><label>Assigned person<select aria-label="Assigned person" name="personId" defaultValue={assigned?._id??''} autoFocus><option value="">Unassigned</option>{people.filter(p=>!p.archivedAt).map(p=><option key={p._id} value={p._id}>{p.name}</option>)}</select></label><p>New reports use the new assignment. Previously recorded usage keeps its original person.</p></>:<><p>{descriptions[action??'']}</p></>}<div className="actions"><button type="button" disabled={busy} onClick={()=>setAction(null)}>Cancel</button><button className="primary" disabled={busy}>{busy?'Saving…':action==='edit'?'Save changes':action==='assign'?'Save assignment':action==='archive'?'Archive '+noun:action==='restore'?'Restore '+noun:action==='revoke'?'Revoke reporting':action==='rotate-key'?'Rotate key':'Generate new key'}</button></div></form></dialog>
 </>;
}
