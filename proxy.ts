import { NextRequest, NextResponse } from 'next/server';
import { clientIpProxyHeaders } from './lib/client-ip-proxy';

export function proxy(request: NextRequest) {
  const headers = clientIpProxyHeaders(
    request.headers,
    request.method,
    request.nextUrl.pathname + request.nextUrl.search,
    process.env.CLIENT_IP_PROXY_SECRET,
    process.env.VERCEL === '1',
  );
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: '/api/:path*' };
