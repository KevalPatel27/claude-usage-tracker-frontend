'use client';
import Link from 'next/link';
import { Heading } from '@/components/shared';
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return <><Heading title="This view couldn’t load" description="Your recorded usage is still stored. Try loading this view again."/><section className="panel recovery-panel" role="alert"><p>If the backend is waking up, it may take a moment to become available.</p><div className="actions"><button className="primary" onClick={retry}>Try again</button><Link className="button" href="/overview">Go to usage</Link></div></section></>;
}
