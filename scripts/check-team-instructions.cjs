/* eslint-disable @typescript-eslint/no-require-imports -- Local browser QA. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'.local/team-instructions-ui');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write'],reducedMotion:'reduce'}),p=await context.newPage(),errors=[],checks=[];
 p.on('pageerror',e=>errors.push(e.message));const login=JSON.parse(fs.readFileSync(path.join(root,'.local/local-admin.json'),'utf8'));
 await p.goto('http://127.0.0.1:3000/login');await p.getByLabel('Username',{exact:true}).fill(login.username);await p.getByLabel('Password',{exact:true}).fill(login.password);await p.getByRole('button',{name:'Sign in',exact:true}).click();await p.waitForURL('**/overview');
 const did='1'.repeat(24),pid='2'.repeat(24);let updates=0;
 await p.route('**/api/**',route=>{const req=route.request(),url=new URL(req.url());
  if(url.pathname==='/api/people')return route.fulfill({json:[{_id:pid,name:'Synthetic person'}]});
  if(url.pathname==='/api/devices'&&req.method()==='GET')return route.fulfill({json:[{_id:did,name:'Synthetic team laptop',personId:{_id:pid,name:'Synthetic person'},revokedAt:null}]});
  if(url.pathname==='/api/devices/'+did+'/prompt-history'){updates++;assert.deepEqual(req.postDataJSON(),{enabled:true});return route.fulfill({json:{}});}
  if(!['GET','HEAD'].includes(req.method()))return route.fulfill({status:409,json:{error:'QA blocks real writes'}});
  return route.continue();});
 await p.goto('http://127.0.0.1:3000/connect?deviceId='+did+'&history=1');
 const section=p.getByRole('region',{name:'Send instructions to your team'});
 await section.waitFor();assert.ok(await section.getByRole('button',{name:'Copy Windows instructions',exact:true}).isDisabled());
 await section.getByLabel('Setup download website',{exact:true}).fill('https://dashboard.example.test');
 await p.getByRole('button',{name:'Enable history & show setup',exact:true}).click();
 await p.getByRole('heading',{name:'Optional prompt history setup',exact:true}).waitFor();
 assert.equal(await section.getByLabel('Setup download website',{exact:true}).inputValue(),'https://dashboard.example.test');
 for(const audience of ['Update an existing PC','New installation']){
  await section.getByRole('button',{name:audience,exact:true}).click();
  for(const os of ['Windows','Mac','Linux']){
   assert.equal(await section.getByLabel('Setup download website',{exact:true}).inputValue(),'https://dashboard.example.test');
   await section.getByRole('button',{name:'Copy '+os+' instructions',exact:true}).click();
   await section.getByRole('status').filter({hasText:os+' instructions copied.'}).waitFor();
   const text=await p.evaluate(()=>navigator.clipboard.readText());
   assert.ok(text.includes('Device ID: '+did));assert.ok(text.includes('https://dashboard.example.test/setup-history.py'));assert.ok(text.includes('SAME existing device key'));assert.ok(text.includes('60 seconds'));assert.ok(text.includes('Automated notifications'));assert.equal(text.includes('dkey_'),false);assert.equal(text.includes('[https://'),false);
   if(audience==='Update an existing PC'){assert.ok(text.includes('Keep your existing metrics setup'));assert.equal(text.includes('powershell.exe -NoProfile'),false);}
   else assert.ok(text.includes(os==='Windows'?'-ExecutionPolicy Bypass':os==='Mac'?'bash "./setup-macos.sh"':'bash "./setup-linux.sh"'));
   const pending=p.waitForEvent('download');await section.getByRole('button',{name:'Download '+os+' instructions',exact:true}).click();const download=await pending;
   assert.equal(fs.readFileSync(await download.path(),'utf8').replaceAll('\r\n','\n'),text.replaceAll('\r\n','\n'));assert.ok(download.suggestedFilename().endsWith('.txt'));
  }
 }
 checks.push('All six new/update OS messages copy real clipboard text and download identical key-free .txt files');
 await section.getByRole('button',{name:'Update an existing PC',exact:true}).click();
 await section.getByLabel('Setup download website',{exact:true}).fill('https://example.test/path');assert.ok(await section.getByRole('button',{name:'Copy Mac instructions',exact:true}).isDisabled());
 await section.getByLabel('Setup download website',{exact:true}).fill('http://127.0.0.1:3000');await section.getByText('A local address works only on this PC.',{exact:false}).waitFor();
 await section.getByLabel('Setup download website',{exact:true}).fill('https://dashboard.example.test');
 await p.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new DOMException('Denied','NotAllowedError');};});
 await section.getByRole('button',{name:'Copy Windows instructions',exact:true}).click();await section.getByText('Clipboard access is unavailable.',{exact:false}).waitFor();
 const preview=section.getByLabel('Windows instruction preview',{exact:true});await preview.waitFor();assert.ok(await preview.evaluate(el=>el.selectionEnd===el.value.length));
 checks.push('Invalid origins disable copy; loopback warning is visible; denied clipboard opens/selects readable fallback text');
 // Close preview for normal compact layout before visual review.
 await section.getByText('Preview message',{exact:true}).first().click();
 for(const width of [1440,390,360]){await p.setViewportSize({width,height:1000});await section.scrollIntoViewIfNeeded();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:path.join(out,'team-'+width+'.png'),fullPage:true});}
 assert.equal(updates,1);assert.deepEqual(errors,[]);checks.push('1440/390/360px layouts fit; only intercepted opt-in write occurred, with no new device registration/key rotation');
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,checks,errors,realWrites:'Local sign-in only; management writes intercepted'},null,2));console.log(JSON.stringify({passed:true,checks,errors},null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
