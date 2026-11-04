import type { ReactNode } from 'react';

function Bar({ wide = false }: { wide?: boolean }) {
  return <span className={'skeleton-bar' + (wide ? ' skeleton-wide' : '')}/>;
}

/** Decorative placeholders never expose fabricated usage numbers to assistive technology. */
export function LoadingState({ label = 'Loading workspace…', variant = 'overview' }: {
  label?: string; variant?: 'overview' | 'directory' | 'profile' | 'table' | 'settings' | 'form';
}) {
  let content: ReactNode;
  if (variant === 'table') content = <div className="skeleton-table">{[0, 1, 2, 3].map(n => <div key={n}><Bar wide/><Bar/><Bar/></div>)}</div>;
  else if (variant === 'directory') content = <div className="skeleton-directory">{[0, 1, 2].map(n => <div className="person-card" key={n}><div className="skeleton-person"><span className="skeleton-avatar"/><Bar wide/></div><div className="skeleton-device"><Bar wide/><Bar/></div></div>)}</div>;
  else if (variant === 'settings' || variant === 'form') content = <div className="skeleton-fields">{[0, 1, 2].map(n => <div key={n}><Bar/><Bar wide/></div>)}</div>;
  else content = <><div className="skeleton-summary panel">{[0, 1, 2].map(n => <div key={n}><Bar/><span className="skeleton-value"/><Bar wide/></div>)}</div><div className="analytics-grid"><div className="panel skeleton-chart"><Bar/><div className="skeleton-plot"/></div><div className="panel skeleton-chart"><Bar/><div className="skeleton-ring"/></div></div></>;
  return <div className={'loading-state loading-' + variant} aria-busy="true"><p className="loading-label" role="status">{label}</p><div aria-hidden="true">{content}</div></div>;
}
