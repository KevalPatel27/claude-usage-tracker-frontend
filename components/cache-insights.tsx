import type { OverviewData } from '@/lib/api';
import { count } from './usage-charts';

export function CacheInsights({ data }: { data: OverviewData }) {
  const value = (type: string) => data.totalsByType.find(r => r._id === type)?.total ?? 0;
  const parts = [{ type: 'input', label: 'Fresh input', color: '#2563eb' }, { type: 'cacheRead', label: 'Reused input', color: '#7c63c4' }, { type: 'cacheCreation', label: 'Saved for reuse', color: '#b77816' }].map(p => ({ ...p, value: value(p.type) }));
  const total = parts.reduce((sum, p) => sum + p.value, 0), reused = value('cacheRead');
  return <section className="panel cache-insights" aria-label="Input cache reuse"><div className="cache-insight-heading"><div><h2>How much input was reused?</h2><p className="section-description">Recorded input composition for these usage filters</p></div><div className="cache-share"><strong>{total ? (reused / total * 100).toFixed(1) + '%' : '—'}</strong><span>{total ? 'of recorded input came from cache' : 'No input readings in this period'}</span></div></div>
    {total > 0 && <div className="cache-share-track" aria-hidden="true">{parts.filter(p => p.value > 0).map(p => <span key={p.type} style={{ width: `${p.value / total * 100}%`, background: p.color }}/>)}</div>}
    <div className="cache-share-legend">{parts.map(p => <div key={p.type}><span><i style={{ background: p.color }}/>{p.label}</span><strong>{count(p.value)}</strong></div>)}</div>
    <p className="footnote">Reused input ÷ (fresh input + reused input + cache writes). This is a token reuse share, not a request hit rate or subscription allowance.</p>
  </section>;
}
