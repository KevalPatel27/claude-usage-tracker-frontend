"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Download, RefreshCw, Monitor, ArrowUpRight, CheckCircle2, Clock3 } from 'lucide-react';
import { apiFetch, peopleApi, type Person, type OverviewData, type CollectionStatus } from '@/lib/api';
import { PriceCatalog, PricingWarnings } from './price-catalog';
import { SessionUsage } from './session-usage';
import { TokenGuide } from './token-guide';
import { Heading, ErrorBox } from './shared';
import { UsageTrend, TokenMix, tokenCategories, count, money } from './usage-charts';
type Preset = 'today'|'7d'|'30d'|'custom';
function dateInZone(zone: string) { const p = new Intl.DateTimeFormat('en-CA', { timeZone:zone, year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(new Date()); const values=Object.fromEntries(p.map(v=>[v.type,v.value]));return `${values.year}-${values.month}-${values.day}`; }
function presetDates(preset: Preset, timezone: string) { const to=dateInZone(timezone), d=new Date(to+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(preset==='7d'?6:preset==='30d'?29:0));return {from:d.toISOString().slice(0,10),to}; }
const timestamp=(value:string|null,timezone:string)=>value?new Date(value).toLocaleString(undefined,{timeZone:timezone,timeZoneName:'short'}):'No report received';
const errorMessage=(e:unknown)=>e instanceof Error?e.message:'Unable to load usage. Try refreshing.';
export function Overview() {
  const params=useSearchParams();
  const [filters,setFilters]=useState({from:params.get('from')??'',to:params.get('to')??'',timezone:params.get('timezone')??'UTC',sessionId:params.get('sessionId')??'',personId:params.get('personId')??'',deviceId:params.get('deviceId')??'',model:params.get('model')??''});
  const [initialTimezone]=useState(()=>params.get('timezone'));
  const [preset,setPreset]=useState<Preset>(params.has('from')||params.has('to')?'custom':'today');
  const [people,setPeople]=useState<Person[]>([]),[models,setModels]=useState<string[]>([]);
  const [data,setData]=useState<OverviewData|null>(null),[collection,setCollection]=useState<CollectionStatus|null>(null);
  const [ready,setReady]=useState(false),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
  const active=useRef<AbortController|null>(null);
  useEffect(()=>{let mounted=true;Promise.all([apiFetch<{reportingTimezone:string}>('/dashboard/settings'),peopleApi.list()]).then(([settings,p])=>{if(mounted){setPeople(p);const zone=initialTimezone??settings.reportingTimezone;setFilters(f=>({...f,timezone:zone,...(!f.from&&!f.to?presetDates('today',zone):{})}));setReady(true);}}).catch(e=>{if(mounted){setError(errorMessage(e));setLoading(false);}});return()=>{mounted=false;};},[initialTimezone]);
  const query=new URLSearchParams();Object.entries(filters).forEach(([key,value])=>{if(value)query.set(key,value);});const qs=query.toString();
  const refresh=useCallback(async()=>{if(!ready)return;active.current?.abort();const controller=new AbortController();active.current=controller;setRefreshing(true);try{
    const [usage,status]=await Promise.all([apiFetch<OverviewData>('/dashboard/overview?'+qs,{signal:controller.signal}),apiFetch<CollectionStatus>('/dashboard/collection-status',{signal:controller.signal})]);
    if(controller.signal.aborted)return;setData(usage);setCollection(status);setModels(existing=>[...new Set([...existing,...usage.byModel.map(r=>r._id.model)])].sort());setError('');
  }catch(e){if(!controller.signal.aborted)setError(errorMessage(e));}finally{if(!controller.signal.aborted){setRefreshing(false);setLoading(false);}}},[ready,qs]);
  useEffect(()=>{const first=setTimeout(()=>void refresh(),0);const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},30000);const visible=()=>{if(document.visibilityState==='visible')void refresh();};document.addEventListener('visibilitychange',visible);return()=>{clearTimeout(first);clearInterval(timer);active.current?.abort();document.removeEventListener('visibilitychange',visible);};},[refresh]);
  function choosePreset(value:Preset){setPreset(value);if(value!=='custom')setFilters(f=>({...f,...presetDates(value,f.timezone)}));}
  const total=data?.totalsByType.reduce((n,r)=>n+r.total,0)??0;
  const displayZone=data?.period.timezone??filters.timezone;
  const recent=collection?.devices.filter(d=>d.status==='recent').length??0;
  const selectedDevice=collection?.devices.find(d=>d.deviceId===filters.deviceId);
  const lastReport=selectedDevice?.lastReportAt??data?.lastReportAt??null;
  const hasFilters=!!(filters.personId||filters.deviceId||filters.model||filters.sessionId);
  return <>
    <Heading title="Usage overview" description="A clear view of Claude Code usage across your configured PCs.">
      <button onClick={()=>void refresh()} disabled={refreshing||!ready}><RefreshCw size={16} className={refreshing?'refreshing':''}/>{refreshing?'Refreshing…':'Refresh'}</button>
      <a className="button" href={'/api/dashboard/export.csv?'+qs}><Download size={16}/>Export CSV</a>
    </Heading>
    <section className="filter-panel" aria-label="Usage filters">
      <div className="filter-topline"><div className="date-presets" role="group" aria-label="Date range">{([['today','Today'],['7d','Last 7 days'],['30d','Last 30 days'],['custom','Custom']] as const).map(([key,label])=><button key={key} aria-pressed={preset===key} onClick={()=>choosePreset(key)}>{label}</button>)}</div><span className="filter-hint">Times shown in {filters.timezone}</span></div>
      <div className="overview-filters"><label>From<input type="date" value={filters.from} max={filters.to||undefined} onChange={e=>{setPreset('custom');setFilters({...filters,from:e.target.value});}}/></label><label>Through<input type="date" value={filters.to} min={filters.from||undefined} onChange={e=>{setPreset('custom');setFilters({...filters,to:e.target.value});}}/></label>
        <label>Assigned person<select aria-label="Person" value={filters.personId} onChange={e=>setFilters({...filters,personId:e.target.value})}><option value="">All people</option>{people.map(p=><option key={p._id} value={p._id}>{p.name}</option>)}</select></label>
        <label>Device<select aria-label="Device" value={filters.deviceId} onChange={e=>setFilters({...filters,deviceId:e.target.value})}><option value="">All devices</option>{collection?.devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.deviceName}</option>)}</select></label>
        <label>Model<select aria-label="Model" value={filters.model} onChange={e=>setFilters({...filters,model:e.target.value})}><option value="">All models</option>{models.map(m=><option key={m}>{m}</option>)}</select></label>
        <label>Timezone<select aria-label="Reporting timezone" value={filters.timezone} onChange={e=>{const zone=e.target.value;setFilters(f=>({...f,timezone:zone,...(preset!=='custom'?presetDates(preset,zone):{})}));}}>{[...new Set(['UTC','Asia/Kolkata',...Intl.supportedValuesOf('timeZone')])].map(z=><option key={z}>{z}</option>)}</select></label>
      <label>Session ID<input aria-label="Session ID" maxLength={128} placeholder="All sessions" value={filters.sessionId} onChange={e=>setFilters({...filters,sessionId:e.target.value})}/></label></div>{hasFilters&&<button className="reset-filters" onClick={()=>setFilters({...filters,personId:'',deviceId:'',model:'',sessionId:''})}>Clear person, device, model & session filters</button>}
    </section>
    {error&&<ErrorBox error={(data?'Refresh failed; the displayed data is stale. ':'')+error}/>}
    {loading&&<div className="overview-loading" role="status"><span/>Loading recorded usage…</div>}
    {data&&<>
      <div className="report-strip"><span><CheckCircle2 size={14}/>Updated {timestamp(data.generatedAt,displayZone)}</span><span><Clock3 size={14}/>Last report received: {timestamp(lastReport,displayZone)}</span></div>
      <section className="usage-summary refined-summary" aria-label="Usage totals">
        <div className="primary-total"><p>Recorded tokens</p><strong>{count(total)}</strong><small>{data.recordCount?`${data.recordCount.toLocaleString()} metric readings in this period`:'No token reports in this period'}</small></div>
        <div className="token-breakdown">{tokenCategories.map(c=><div key={c.key}><span><i style={{background:c.color}}/>{c.label}</span><strong>{count(data.totalsByType.find(r=>r._id===c.key)?.total??0)}</strong></div>)}</div>
        <div className="cost"><p>Estimated API-equivalent cost</p><strong data-testid="estimated-cost">{data.estimatedCostUsd===null?'Unavailable':money(data.estimatedCostUsd)}</strong><small>{data.estimatedCostUsd===null?(data.pricing.unpricedModels.length?'Missing rates: '+data.pricing.unpricedModels.join(', '):'No priced token reports in this period'):'USD · Current standard API rates'}</small><a href="#pricing-details" onClick={() => { const details=document.getElementById("pricing-details") as HTMLDetailsElement | null; if(details) details.open=true; }}>View pricing assumptions</a></div>
      </section>
      {!data.recordCount&&<section className="empty"><Monitor size={30}/><h2>No usage received for these filters</h2><p>This does not confirm zero activity. Try a wider date range or connect a PC.</p><Link className="button primary" href="/connect">Connect a PC</Link></section>}
      <div className="analytics-grid"><UsageTrend data={data}/><TokenMix data={data}/></div>
      <div className="breakdown-grid"><section className="panel"><div className="section-title"><div><h2>Usage by person</h2><p className="section-description">Based on each device’s assignment</p></div><span className="subtle-count">{data.byPerson.length} {data.byPerson.length===1?'person':'people'}</span></div>
        {data.byPerson.length?<div className="rank-list">{data.byPerson.map((p,index)=><div key={p.personId??'unassigned'} className="rank-row"><span className="person-avatar" aria-hidden="true">{p.personName.slice(0,1).toUpperCase()}</span><div className="rank-person"><div><Link href={p.personId?'/overview?personId='+p.personId:'/overview'}>{p.personName}</Link><strong>{count(p.totalTokens)}</strong></div><div className="rank-track"><span style={{width:`${p.totalTokens/Math.max(1,...data.byPerson.map(r=>r.totalTokens))*100}%`,opacity:Math.max(.4,1-index*.1)}}/></div></div><ArrowUpRight size={15}/></div>)}</div>:<p className="muted">No attributed usage in this period.</p>}
      </section>
      <section className="panel"><div className="section-title"><div><h2>Usage by device</h2><p className="section-description">Recorded tokens in the selected period</p></div><Monitor size={18}/></div><table><thead><tr><th>Device</th><th>Tokens</th></tr></thead><tbody>{data.byDevice.map(d=><tr key={d._id}><td><Link href={'/overview?deviceId='+d._id}>{d.deviceName}</Link></td><td>{count(d.totalTokens)}</td></tr>)}</tbody></table>{!data.byDevice.length&&<p className="muted">No device usage in this period.</p>}</section></div>
      <SessionUsage key={qs} query={qs} refreshKey={data.generatedAt} onSelect={(sessionId,deviceId)=>setFilters(f=>({...f,sessionId,deviceId}))}/>
      <TokenGuide/>
      <section className="panel model-panel"><div className="section-title"><div><h2>Model breakdown</h2><p className="section-description">Token categories and current API-equivalent estimates</p></div></div><div className="table-scroll"><table><thead><tr><th>Model</th>{tokenCategories.map(c=><th key={c.key}>{c.label}</th>)}<th>Total tokens</th><th>Est. cost</th></tr></thead><tbody>{[...new Set(data.byModel.map(r=>r._id.model))].sort().map(m=>{const rows=data.byModel.filter(r=>r._id.model===m),estimate=data.costByModel.find(r=>r.model===m)?.estimatedCostUsd;return <tr key={m}><td><span className="model-name">{m}</span></td>{tokenCategories.map(c=><td key={c.key}>{count(rows.find(r=>r._id.tokenType===c.key)?.totalTokens??0)}</td>)}<td><strong>{count(rows.reduce((n,r)=>n+r.totalTokens,0))}</strong></td><td>{estimate===null||estimate===undefined?'Unpriced':money(estimate)}</td></tr>;})}</tbody></table></div></section>
      <PricingWarnings data={data}/><section className="panel collection-panel"><div className="section-title"><div><h2>Collection status</h2><p className="section-description">Last authenticated report received from each PC</p></div><span className="collection-summary">{recent} with recent reports / {collection?.devices.length??0} devices</span></div><div className="table-scroll"><table><thead><tr><th>Device</th><th>Assigned person</th><th>Last report received</th><th>Collection state</th></tr></thead><tbody>{collection?.devices.map(d=><tr key={d.deviceId}><td><Link href={'/overview?deviceId='+d.deviceId}>{d.deviceName}</Link></td><td>{d.personName??'Unassigned'}</td><td>{timestamp(d.lastReportAt,displayZone)}</td><td><span className={'badge '+d.status}><i/>{({recent:'Recent report',stale:'No recent report',never:'Awaiting first report',revoked:'Revoked'})[d.status]}</span></td></tr>)}</tbody></table></div>{!collection?.devices.length&&<p className="muted">No devices registered. Start with Connect a PC.</p>}<p className="footnote">Report status does not prove that a PC is online. Idle sessions and outages may leave gaps.</p></section>
      <details id="pricing-details" className="panel pricing-details"><summary>Pricing assumptions & data notes</summary><div><p>Estimated API cost is separate from your Max subscription bill. It does not indicate remaining plan allowance.</p><p>{data.pricing.basis}</p>{data.pricing.source&&<p>Rates checked {data.pricing.verifiedAt??'on the configured date'} against <a href={data.pricing.source} target="_blank" rel="noreferrer">Anthropic pricing <ArrowUpRight size={12}/></a>.</p>}{data.pricing.configurationError&&<p className="error">{data.pricing.configurationError}</p>}<PriceCatalog data={data}/><p>Current rates are applied to the selected records; historical price changes are not reconstructed. Graphs use export-time increments. Missing reports are not confirmed zero usage.</p></div></details>
    </>}
  </>;
}
