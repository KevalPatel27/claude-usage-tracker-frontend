"use client";
import { useState } from 'react';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { OverviewData } from '@/lib/api';
export const tokenCategories = [
  { key: 'input', label: 'Input', color: '#2563eb' },
  { key: 'output', label: 'Output', color: '#0f766e' },
  { key: 'cacheRead', label: 'Cache read', color: '#7c63c4' },
  { key: 'cacheCreation', label: 'Cache write', color: '#b77816' },
] as const;
export const count = (v: number) => v.toLocaleString();
export const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: v > 0 && v < .01 ? 6 : 4 }).format(v);
const compact = (v: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
export function UsageTrend({ data }: { data: OverviewData }) {
  const [metric, setMetric] = useState<'tokens'|'cost'>('tokens');
  const hourly = data.trendGranularity === 'hour';
  const format = new Intl.DateTimeFormat('en-GB', { timeZone: data.period.timezone, ...(hourly ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : { month: 'short', day: 'numeric' }) });
  // Empty hourly buckets are null, never a fabricated zero-usage reading.
  const observed = new Map(data.trend.map(r => [new Date(r.at).getTime(), r]));
  let points = data.trend.map(r => ({ ...r, label: format.format(new Date(r.at)) }));
  if (hourly && points.length) {
    const anchor = new Date(points[0].at).getTime();
    const start = anchor - Math.ceil((anchor - new Date(data.period.from).getTime()) / 3600000) * 3600000;
    points = [];
    for (let at = start; at < new Date(data.period.to).getTime(); at += 3600000) {
      const row = observed.get(at);
      points.push({ at: new Date(at).toISOString(), totalTokens: row?.totalTokens ?? 0,
        input: row ? row.input : null, output: row ? row.output : null, cacheRead: row ? row.cacheRead : null, cacheCreation: row ? row.cacheCreation : null,
        estimatedCostUsd: row?.estimatedCostUsd ?? null, label: format.format(new Date(at)) } as typeof points[number]);
    }
  }
  return <section className="panel trend-panel" aria-label="Usage over time">
    <div className="section-title"><div><h2>Usage over time</h2><p className="section-description">{hourly ? 'Hourly' : 'Daily'} recorded increments · {data.period.timezone}</p></div>
      <div className="segmented" role="group" aria-label="Chart metric"><button aria-pressed={metric === 'tokens'} onClick={() => setMetric('tokens')}>Tokens</button><button aria-pressed={metric === 'cost'} onClick={() => setMetric('cost')}>Estimated cost</button></div>
    </div>
    {data.trend.length ? <>
      <div className="chart-frame" aria-label={metric === 'tokens' ? 'Stacked token usage chart' : 'Estimated API cost chart'}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 600, height: 280 }}>
          <BarChart data={points} accessibilityLayer margin={{ top: 18, right: 12, bottom: 8, left: 0 }} maxBarSize={40}>
            <CartesianGrid vertical={false} stroke="#e6edf5" strokeDasharray="3 4" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#60718a', fontSize: 11 }} minTickGap={26} dy={8} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: '#60718a', fontSize: 11 }} width={58} tickFormatter={v => metric === 'cost' ? '$' + Number(v).toPrecision(2) : compact(Number(v))} />
            <Tooltip cursor={{ fill: '#f0f5fb' }} wrapperStyle={{ maxWidth: 'calc(100% - 30px)', whiteSpace: 'normal' }} contentStyle={{ borderRadius: 8, border: '1px solid #d8e1eb', fontSize: 12, whiteSpace: 'normal', overflowWrap: 'anywhere' }}
              formatter={(value, name) => [metric === 'cost' ? money(Number(value)) : count(Number(value)) + ' tokens', name]}
              labelFormatter={label => `${String(label)} (${data.period.timezone})`} />
            {metric === 'tokens' ? tokenCategories.map(c => <Bar key={c.key} dataKey={c.key} name={c.label} stackId="tokens" fill={c.color} isAnimationActive={false} />) :
              <Bar dataKey="estimatedCostUsd" name="Estimated API cost" fill="#2563eb" radius={[4,4,0,0]} isAnimationActive={false} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {metric === 'tokens' && <div className="chart-legend">{tokenCategories.map(c => <span key={c.key}><i style={{ background: c.color }} />{c.label}</span>)}</div>}
      {metric === 'cost' && data.estimatedCostUsd === null && <p className="footnote">Some reported models have no configured rates. Unpriced intervals have no cost bar.</p>}
      <details className="chart-table"><summary>View chart data</summary><div className="table-scroll"><table><caption className="sr-only">Recorded usage over time</caption><thead><tr><th>{hourly ? 'Hour' : 'Day'} ({data.period.timezone})</th>{tokenCategories.map(c => <th key={c.key}>{c.label}</th>)}<th>Tokens</th><th>Est. cost</th></tr></thead><tbody>{data.trend.map(r => <tr key={r.at}><td>{format.format(new Date(r.at))}</td>{tokenCategories.map(c => <td key={c.key}>{count(r[c.key])}</td>)}<td>{count(r.totalTokens)}</td><td>{r.estimatedCostUsd === null ? 'Unpriced' : money(r.estimatedCostUsd)}</td></tr>)}</tbody></table></div></details>
    </> : <div className="chart-empty"><p>No token reports in this period.</p><small>A graph appears when this device reports usage.</small></div>}
    <p className="footnote">Reports are grouped by export time. Gaps mean no report, not confirmed zero usage.</p>
  </section>;
}
export function TokenMix({ data }: { data: OverviewData }) {
  const total = data.totalsByType.reduce((n,r) => n + r.total, 0);
  const rows = tokenCategories.map(c => ({ ...c, value: data.totalsByType.find(r => r._id === c.key)?.total ?? 0 }));
  return <section className="panel mix-panel"><div className="section-title"><div><h2>Token composition</h2><p className="section-description">Share of recorded tokens</p></div></div>
    <div className="donut-wrap" aria-hidden="true">
      {total ? <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{width:300,height:210}}><PieChart><Pie data={rows.filter(r => r.value > 0)} dataKey="value" nameKey="label" innerRadius={65} outerRadius={88} paddingAngle={2} stroke="none" isAnimationActive={false}>{rows.filter(r => r.value > 0).map(c => <Cell key={c.key} fill={c.color} />)}</Pie><Tooltip wrapperStyle={{ maxWidth: 'calc(100% - 30px)', whiteSpace: 'normal' }} contentStyle={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }} formatter={v => count(Number(v)) + ' tokens'} /></PieChart></ResponsiveContainer> : <div className="empty-ring" />}
      <div className="donut-center"><strong>{compact(total)}</strong><small>recorded tokens</small></div>
    </div>
    <ul className="mix-list" aria-label="Token category breakdown">{rows.map(c => <li key={c.key}><span><i style={{ background:c.color }} />{c.label}</span><strong>{count(c.value)}</strong><small>{total ? (c.value > 0 && c.value/total*100 < .1 ? '<0.1%' : (c.value/total*100).toFixed(1)+'%') : '—'}</small></li>)}</ul>
  </section>;
}
