/* eslint-disable @typescript-eslint/no-require-imports -- Standalone generation checks. */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript');
const file = path.resolve(__dirname, '../lib/team-setup.ts');
const result = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: result.exports, URL });
const { setupOrigin, teamSetupMessage } = result.exports;
const common = { deviceId: '1'.repeat(24), deviceName: 'Synthetic team laptop', backendUrl: 'https://backend.example.test', siteUrl: 'https://dashboard.example.test', history: true };
for (const platform of ['windows', 'macos', 'linux']) {
  for (const audience of ['new', 'update']) {
    const text = teamSetupMessage({ ...common, platform, audience });
    assert.ok(text.includes(platform === 'windows' ? '-DeviceId "' + common.deviceId + '"' : '--device-id "' + common.deviceId + '"'));
    assert.ok(text.includes('https://dashboard.example.test/'+(platform==='windows'?'setup-pc.ps1':`setup-${platform}.sh`)));
    assert.equal(text.includes('setup-history.py'),false);
    if(audience==='update')assert.ok(text.includes('SAME existing device key'));
    assert.ok(text.includes('NEW local Code session'));
    assert.ok(text.includes('60 seconds'));
    assert.ok(text.includes('Automated notifications'));
    assert.equal(text.includes('dkey_'), false);
    assert.equal(text.includes('[https://'), false, 'Commands/links must be plain text');
    assert.ok(text.includes(platform === 'windows' ? '-ExecutionPolicy Bypass' : `bash "./setup-${platform}.sh"`));
    assert.ok(text.includes('No second installer is needed'));

  }
  const metrics = teamSetupMessage({ ...common, history: false, platform, audience: 'update' });
  assert.ok(metrics.includes('SAME existing device key')); assert.equal(metrics.includes('setup-history.py'), false);
  assert.ok(metrics.includes('does not enable input-text history'));
}
for (const value of ['https://host/path','https://name:secret@host','https://host?token=secret','http://public.example','https://$(whoami).example','[https://host](https://host)']) assert.equal(setupOrigin(value), null);
assert.equal(setupOrigin('https://host.example/'), 'https://host.example');
assert.equal(teamSetupMessage({ ...common, platform:'windows',audience:'new',deviceId:'bad";command' }), null);
console.log('PASS: all 6 OS/new-update messages, 3 metrics-only updates, safe plain origins, exact device binding and key-free messages.');
