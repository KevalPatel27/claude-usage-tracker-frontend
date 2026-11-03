import type { OverviewData } from '@/lib/api';
import { money, tokenCategories } from './usage-charts';

export function PricingWarnings({data}:{data:OverviewData}) {
 const models=new Set(data.byModel.map(r=>r._id.model));
 return <>{data.pricing.catalog?.filter(row=>row.note&&(models.has(row.id)||row.aliases.some(id=>models.has(id)))).map(row=><p className="footnote" key={row.id}><strong>{row.name} pricing:</strong> {row.note}</p>)}</>;
}
export function PriceCatalog({data}:{data:OverviewData}) {
 const catalog=data.pricing.catalog;
 if(!catalog?.length)return null;
 return <section className="rate-catalog" aria-labelledby="rate-catalog-title"><h3 id="rate-catalog-title">All model rates</h3><p>USD per 1 million tokens. Estimates use standard speed and 5-minute cache writes. The model breakdown above shows only models with recorded usage.</p><div className="table-scroll" tabIndex={0} role="region" aria-label="Model price reference"><table><caption className="sr-only">Official model price catalog, checked {data.pricing.verifiedAt}</caption><thead><tr><th>Model</th>{tokenCategories.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{catalog.map(row=><tr key={row.id}><th scope="row"><strong>{row.name}</strong><code>{row.id}</code>{row.overridden&&<small>Custom backend rates</small>}{row.note&&<small>{row.note}</small>}</th>{tokenCategories.map(c=><td key={c.key}>{row.rates?money(row.rates[c.key]):'Unavailable'}{row.longPromptRates&&<small>{money(row.longPromptRates[c.key])} above 100k</small>}</td>)}</tr>)}</tbody></table></div><p>Older models listed here may be retired. Their presence supports usage history and does not indicate current availability. Unknown or newly released IDs remain unpriced until verified.</p></section>;
}
