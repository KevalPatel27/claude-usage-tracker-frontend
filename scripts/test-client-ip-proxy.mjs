import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const filename = fileURLToPath(new URL('../lib/client-ip-proxy.ts', import.meta.url));
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const implementation = new Module(filename);
implementation.filename = filename;
implementation._compile(compiled.outputText, filename);
const { clientIpProxyHeaders } = implementation.exports;
const secret = 'isolated-forwarding-header-test-secret-00000000';
const target = '/api/auth/login?test=forwarded';
const headers = new Headers({
  'x-vercel-forwarded-for': '198.51.100.25',
  'x-forwarded-for': '103.250.144.203',
  'x-tracker-client-ip': '103.250.144.203',
  'x-tracker-client-time': String(Date.now()),
  'x-tracker-client-signature': '0'.repeat(64),
  cookie: 'admin_token=isolated-cookie',
  'content-type': 'application/json',
});
const forwarded = clientIpProxyHeaders(headers, 'POST', target, secret, true);
assert.equal(forwarded.get('x-tracker-client-ip'), '198.51.100.25');
assert.equal(forwarded.get('cookie'), headers.get('cookie'));
assert.equal(forwarded.get('content-type'), headers.get('content-type'));
assert.equal(
  forwarded.get('x-tracker-client-signature'),
  createHmac('sha256', secret)
    .update(
      JSON.stringify(['198.51.100.25', forwarded.get('x-tracker-client-time'), 'POST', target]),
    )
    .digest('hex'),
);
const noSecret = clientIpProxyHeaders(headers, 'POST', target, undefined, true);
for (const name of ['x-tracker-client-ip', 'x-tracker-client-time', 'x-tracker-client-signature']) {
  assert.equal(noSecret.get(name), null);
}
assert.equal(
  clientIpProxyHeaders(
    new Headers({
      'x-forwarded-for': '103.250.144.203, 198.51.100.26',
    }),
    'POST',
    target,
    secret,
    false,
  ).get('x-tracker-client-ip'),
  '198.51.100.26',
);
assert.equal(
  clientIpProxyHeaders(
    new Headers({
      'x-real-ip': '2402:a00:408:4126:ac01:ad35:7114:f8d',
    }),
    'POST',
    target,
    secret,
    false,
  ).get('x-tracker-client-ip'),
  '2402:a00:408:4126:ac01:ad35:7114:f8d',
);
for (const ip of ['invalid-ip', 'fe80::1%eth0']) {
  assert.equal(
    clientIpProxyHeaders(
      new Headers({
        'x-real-ip': ip,
      }),
      'POST',
      target,
      secret,
      false,
    ).get('x-tracker-client-ip'),
    null,
  );
}
console.log(
  'PASS: platform client IP, spoofed proof removal, signed method/query, cookie preservation, missing secret and invalid addresses.',
);
