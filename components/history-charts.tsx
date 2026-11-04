'use client';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import type { HistoryData } from '@/lib/history-api';
import { turnDuration } from '@/lib/history-api';

export function HistoryCharts({ data }: { data: HistoryData }) {
  const observed = new Map(data.daily.map(row => [row._id, row]));
  const daily: Array<{_id:string;day:string;prompts:number|null;seconds:number|null}> = [];
  if (data.daily.length) {
    const start = new Date(data.daily[0]._id + 'T00:00:00Z'), end = new Date(data.daily[data.daily.length - 1]._id + 'T00:00:00Z');
    for (let day = start; day <= end && daily.length <= 366; day = new Date(day.getTime() + 86400000)) {
      const id = day.toISOString().slice(0,10), row = observed.get(id);
      daily.push({_id:id,day:id.slice(5),prompts:row?.prompts ?? null,seconds:row?.averageDurationMs == null ? null : row.averageDurationMs / 1000});
    }
  }
  const lengths = [[0, 'Under 100'], [100, '100–499'], [500, '500–1,999'], [2000, '2,000+']].map(([id, label]) => ({ label, prompts: data.lengths.find(r => r._id === id)?.prompts ?? 0 }));
  return <>
    <div className="history-chart-grid">
      <section className="panel"><div className="section-title"><div><h2>Prompts over time</h2><p className="section-description">Captured input submissions per day</p></div><span className="badge">{data.period.timezone}</span></div>
        {daily.length ? <div className="history-chart" aria-label="Daily captured prompt counts"><ResponsiveContainer width="100%" height={240} minWidth={0}><BarChart data={daily} margin={{ left: -18, right: 8, top: 12 }}><CartesianGrid vertical={false} stroke="#e4ebee"/><XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip labelFormatter={(_, rows) => rows?.[0]?.payload?._id ?? ''}/><Bar dataKey="prompts" name="Prompts" fill="#0b7d83" maxBarSize={38} radius={[4, 4, 0, 0]}/></BarChart></ResponsiveContainer></div> : <ChartEmpty text="A daily chart appears after the first captured prompt."/>}
        <details className="chart-data"><summary>View daily counts</summary><table><thead><tr><th>Date</th><th>Prompts</th><th>Average observed duration</th></tr></thead><tbody>{data.daily.map(r => <tr key={r._id}><td>{r._id}</td><td>{r.prompts}</td><td>{turnDuration(r.averageDurationMs)}</td></tr>)}</tbody></table></details>
      </section>
      <section className="panel"><div className="section-title"><div><h2>Observed turn duration</h2><p className="section-description">Daily average for matched submissions and completions</p></div></div>
        {daily.some(d => d.seconds !== null) ? <div className="history-chart" aria-label="Daily average observed turn durations"><ResponsiveContainer width="100%" height={240} minWidth={0}><LineChart data={daily} margin={{ left: -10, right: 12, top: 12 }}><CartesianGrid vertical={false} stroke="#e4ebee"/><XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => turnDuration(Number(v) * 1000)}/><Tooltip formatter={v => [turnDuration(Number(v) * 1000), 'Observed average']}/><Line type="linear" dataKey="seconds" stroke="#527cc2" strokeWidth={2} dot={{ r: 4 }} connectNulls={false}/></LineChart></ResponsiveContainer></div> : <ChartEmpty text="Durations appear when matching completion reports arrive."/>}
        <p className="footnote">Includes processing and waiting between callbacks. This is not API latency or employee working time.</p>
      </section>
    </div>
    <section className="panel history-length-panel"><div><h2>Input length distribution</h2><p className="section-description">Prompt length in characters, not tokens</p><p className="history-length-note">{data.stats.prompts ? Math.round(data.stats.averageLength ?? 0).toLocaleString() + ' characters per prompt on average.' : 'No captured prompts in this period.'}</p></div>
      {data.stats.prompts ? <div className="history-chart" aria-label="Prompt length distribution"><ResponsiveContainer width="100%" height={180} minWidth={0}><BarChart data={lengths} margin={{ left: -22, top: 15, right: 8 }}><XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip/><Bar dataKey="prompts" name="Prompts" fill="#7c63c4" maxBarSize={48} radius={[4, 4, 0, 0]}/></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Length distribution will appear here."/>}
      <details className="chart-data"><summary>View length counts</summary><table><thead><tr><th>Characters</th><th>Prompts</th></tr></thead><tbody>{lengths.map(r => <tr key={r.label}><td>{r.label}</td><td>{r.prompts}</td></tr>)}</tbody></table></details>
    </section>
  </>;
}
function ChartEmpty({ text }: { text: string }) { return <div className="history-chart-empty"><span aria-hidden="true">—</span><p>{text}</p></div>; }
