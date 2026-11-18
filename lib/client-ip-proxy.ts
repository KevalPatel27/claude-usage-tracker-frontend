import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export function clientIpProxyHeaders(
  incoming: Headers,
  method: string,
  path: string,
  secret: string | undefined,
  vercel: boolean,
): Headers {
  const headers = new Headers(incoming);
  for (const name of [
    'x-tracker-client-ip',
    'x-tracker-client-time',
    'x-tracker-client-signature',
  ]) {
    headers.delete(name);
  }
  if (!secret || secret.length < 32) return headers;
  // Vercel overwrites these headers. Hostinger CDN supplies X-Real-IP or the last XFF entry.
  const forwarded = vercel
    ? (incoming.get('x-vercel-forwarded-for') ?? incoming.get('x-forwarded-for'))
    : (incoming.get('x-real-ip') ?? incoming.get('x-forwarded-for'));
  const ip = forwarded?.split(',').at(-1)?.trim();
  if (!ip || ip.includes('%') || !isIP(ip)) return headers;
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', secret)
    .update(JSON.stringify([ip, timestamp, method, path]))
    .digest('hex');
  headers.set('x-tracker-client-ip', ip);
  headers.set('x-tracker-client-time', timestamp);
  headers.set('x-tracker-client-signature', signature);
  return headers;
}
