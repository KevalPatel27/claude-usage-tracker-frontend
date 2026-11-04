/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node QA runner with an injected Playwright installation. */
// Local-only QA. Reads local admin credentials; all fixture responses stay in the browser.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'.local/loading-ui');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),p=await ctx.newPage(),errors=[],checks=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')console.error('Console:',m.text().slice(0,700));});const login=JSON.parse(fs.readFileSync(path.join(root,'.local/local-admin.json'),'utf8'));
 await p.goto('http://127.0.0.1:3000/login');await p.getByLabel('Username',{exact:true}).fill(login.username);await p.getByLabel('Password',{exact:true}).fill(login.password);await p.getByRole('button',{name:'Sign in',exact:true}).click();await p.waitForURL('**/overview');
 const overview=await p.evaluate(async()=>{const r=await fetch('/api/dashboard/overview');return r.json();});
 assert.ok(overview.pricing,'Fixture API failed: '+JSON.stringify(overview));
 const fixture={...overview,recordCount:1,totalsByType:[{_id:'input',total:4242}],byPerson:[],byDevice:[],byModel:[],trend:[],dailyTrend:[],costByModel:[],estimatedCostUsd:0};
 // No mutations after authentication, including accidental form submissions.
 await p.route('**/api/**',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.fulfill({status:409,json:{error:'Browser QA blocks writes'}}));
 let release;const gate=()=>new Promise(r=>{release=r;});let waiting=gate(),fail=false;
 await p.route('**/api/people?*',async route=>{await waiting;return fail?route.fulfill({status:503,json:{error:'Test outage'}}):route.fulfill({json:[]});});
 await p.goto('http://127.0.0.1:3000/people');await p.locator('.loading-directory').waitFor();
 assert.equal(await p.locator('.loading-directory').getAttribute('aria-busy'),'true');assert.equal(await p.locator('.loading-directory [aria-hidden=true]').count(),1);
 assert.equal(await p.locator('.skeleton-bar').first().evaluate(el=>getComputedStyle(el).animationName),'none');
 for(const width of [1440,390,360]){await p.setViewportSize({width,height:1000});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:path.join(out,'directory-'+width+'.png'),fullPage:true});}
 fail=true;release();await p.getByRole('alert').filter({hasText:'Test outage'}).waitFor();assert.equal(await p.getByRole('heading',{name:'Your workspace starts with a person'}).count(),0);
 fail=false;await p.getByRole('button',{name:'Try again',exact:true}).click();await p.getByRole('heading',{name:'Your workspace starts with a person'}).waitFor();checks.push('Directory skeleton is accessible, respects reduced motion, fits 1440/390/360px and failed reads never masquerade as empty data; retry recovers');
 await p.unroute('**/api/people?*');await p.setViewportSize({width:1440,height:1000});
 let failSettings=true;await p.route('**/api/dashboard/settings',route=>failSettings?route.fulfill({status:503,json:{error:'Settings test outage'}}):route.continue());
 await p.goto('http://127.0.0.1:3000/overview');await p.getByRole('alert').filter({hasText:'Settings test outage'}).waitFor();failSettings=false;
 await p.route('**/api/dashboard/overview?*',route=>route.fulfill({json:fixture}));
 await p.getByRole('button',{name:'Try again',exact:true}).click();await p.getByText('4,242',{exact:true}).first().waitFor({timeout:10000}).catch(async e=>{await p.screenshot({path:path.join(out,'failure.png'),fullPage:true});console.error('Browser errors:',errors,'Body:',(await p.locator('main#content').innerText()).slice(0,2500));throw e;});checks.push('Overview bootstrap recovers with Try again instead of requiring a reload');
 await p.unroute('**/api/dashboard/settings');await p.unroute('**/api/dashboard/overview?*');
 await p.clock.install();waiting=gate();let failUsage=false,usageRequests=0;await p.route('**/api/dashboard/overview?*',async route=>{usageRequests++;await waiting;return route.fulfill(failUsage?{status:503,json:{error:'Usage test outage'}}:{json:{...fixture,totalsByType:[{_id:'input',total:9999}]}});});
 await p.getByRole('button',{name:'Last 7 days',exact:true}).click();await p.locator('.loading-overview').waitFor();await p.clock.fastForward(30001);assert.equal(usageRequests,1,'Background polling must not cancel a pending cold-start request');assert.equal(await p.getByText('4,242',{exact:true}).count(),0);assert.ok(await p.getByRole('button',{name:'Export CSV',exact:true}).isDisabled());await p.screenshot({path:path.join(out,'overview-1440.png'),fullPage:true});release();await p.getByText('9,999',{exact:true}).first().waitFor();
 failUsage=true;await p.getByRole('button',{name:'Refresh',exact:true}).click();await p.getByRole('alert').filter({hasText:'displayed data is stale'}).waitFor();assert.ok(await p.getByText('9,999',{exact:true}).count()>0);failUsage=false;await p.getByRole('button',{name:'Try again',exact:true}).click();await p.getByRole('alert').filter({hasText:'displayed data is stale'}).waitFor({state:'detached'});checks.push('Pending cold-start reads survive the 30-second poll; filter changes hide old totals and disable export until matching data arrives; failed refresh retains clearly marked stale results and retry works');
 await p.unroute('**/api/dashboard/overview?*');
 // Request timeout: stalled reads are cancelled; mutations are never automatically retried.
 waiting=gate();await p.route('**/api/people?*',async route=>{await waiting;await route.fulfill({json:[]}).catch(()=>{});});
 await p.goto('http://127.0.0.1:3000/people');await p.locator('.loading-directory').waitFor();await p.clock.fastForward(90001);await p.getByRole('alert').filter({hasText:'Request timed out'}).waitFor();release();await p.unroute('**/api/people?*');await p.clock.resume();checks.push('Stalled API reads time out at 90 seconds with actionable retry');

 // An unexpected render failure stays inside the workspace and can be retried.
 let broken=true;await p.route('**/api/dashboard/overview?*',route=>route.fulfill({json:broken?{...fixture,totalsByType:null}:fixture}));
 await p.goto('http://127.0.0.1:3000/overview');await p.getByRole('heading',{name:'This view couldn’t load',exact:true}).waitFor();broken=false;await p.getByRole('button',{name:'Try again',exact:true}).click();await p.getByText('4,242',{exact:true}).first().waitFor();checks.push('Unexpected render errors keep workspace navigation and recover through the route error boundary');
 assert.deepEqual(errors,[]);const report={checks,errors,mutationWrites:'Blocked after local sign-in',nativeTelemetry:'Not part of this UI check'};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
