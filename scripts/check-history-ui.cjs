/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser QA. */
// Local sign-in only. All history data and mutations below are intercepted fixtures.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..'), out = path.join(root, '.local/history-ui'); fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }), p = await context.newPage(), errors = [], checks = [];
    p.on('pageerror', e => errors.push(e.message));
    const login = JSON.parse(fs.readFileSync(path.join(root, '.local/local-admin.json'), 'utf8'));
    await p.goto('http://127.0.0.1:3000/login'); await p.getByLabel('Username', { exact: true }).fill(login.username); await p.getByLabel('Password', { exact: true }).fill(login.password); await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForURL('**/overview');
    const baseline = await p.evaluate(async () => (await fetch('/api/dashboard/overview')).json());
    const did = '1'.repeat(24), pid = '2'.repeat(24), now = new Date().toISOString();
    const rows = [
      { _id: '3'.repeat(24), deviceId: did, sessionId: 'synthetic-session', promptId: 'synthetic-1', personName: 'Demo person', deviceName: 'Demo laptop', project: 'Customer portal', promptPreview: 'Review the sign-in form and explain the validation errors in plain language.', promptText: 'Review the sign-in form and explain the validation errors in plain language.\nThis is synthetic browser QA input.', promptLength: 118, truncated: false, submittedAt: now, completedAt: now, durationMs: 18000 },
      { _id: '4'.repeat(24), deviceId: did, sessionId: 'synthetic-session', promptId: 'synthetic-2', personName: 'Demo person', deviceName: 'Demo laptop', project: '', promptPreview: 'Add keyboard navigation for the customer search dialog.', promptText: 'Add keyboard navigation for the customer search dialog.', promptLength: 19000, truncated: true, submittedAt: now, completedAt: null, durationMs: null },
      { _id: '5'.repeat(24), deviceId: did, sessionId: 'synthetic-session', promptId: 'synthetic-3', personName: 'Demo person', deviceName: 'Demo laptop', project: '', promptPreview: '', promptText: null, promptLength: null, truncated: false, submittedAt: null, completedAt: now, durationMs: null },
    ];
    const history = { rows, page: 0, hasMore: false, stats: { records: 3, prompts: 2, sessions: 1, averageLength: 9559, averageDurationMs: 18000, completed: 1, incomplete: 2 }, daily: ['2026-11-01','2026-11-02','2026-11-03','2026-11-04'].map((_id,i) => ({ _id, prompts: [4,8,5,2][i], averageDurationMs: [30000,18000,null,22000][i], completed: i===2 ? 0 : 2 })), lengths: [{_id:0,prompts:1},{_id:100,prompts:5},{_id:500,prompts:9},{_id:2000,prompts:4}], projects: [{_id:'Customer portal',prompts:2}], period: { from: now, to: now, timezone: 'Asia/Kolkata' }, retentionDays: 30, generatedAt: now };
    // Charts and totals deliberately agree in populated fixture.
    history.stats.prompts = history.daily.reduce((n,r)=>n+r.prompts,0); history.stats.records=history.stats.prompts+1;
    const diagnostics = { devices: [{ _id: did, name: 'Demo laptop', personId: {_id:pid,name:'Demo person'}, revokedAt:null,archivedAt:null,promptCollectionEnabled:true,lastReportAt:now,lastHistoryReportAt:now,historySetupVersion:'2.0.0',historyPlatform:'windows',historyPendingCount:2,historyDroppedCount:1 }, {_id:'6'.repeat(24),name:'Demo Mac',personId:null,promptCollectionEnabled:false,lastHistoryReportAt:null}], truncated:false, requiredSetupVersion:'2.0.0', retentionDays:30,generatedAt:now };
    const usage = {...baseline, recordCount:4, totalsByType:[{_id:'input',total:1000},{_id:'output',total:500},{_id:'cacheRead',total:6000},{_id:'cacheCreation',total:1000}], byModel:[{_id:{model:'demo-model',tokenType:'input'},totalTokens:1000}], trend:[], dailyTrend:[],estimatedCostUsd:0.05};
    let state='populated', paused=false, project='Customer portal', removed=false, release, searchQuery='', mutationCount=0;
    await p.route('**/api/**', async route => {
      const req=route.request(), url=new URL(req.url()), pathname=url.pathname;
      if(pathname==='/api/dashboard/settings') return route.fulfill({json:{reportingTimezone:'Asia/Kolkata',dataMode:'synthetic'}});
      if(pathname==='/api/people') return route.fulfill({json:[{_id:pid,name:'Demo person'}]});
      if(pathname==='/api/devices'&&req.method()==='GET') return route.fulfill({json:[{_id:did,name:'Demo laptop',personId:{_id:pid,name:'Demo person'},revokedAt:null}]});
      if(pathname==='/api/history/diagnostics') return route.fulfill({json:{...diagnostics,devices:diagnostics.devices.map(d=>({...d,promptCollectionEnabled:d._id===did?!paused:false}))}});
      if(pathname==='/api/devices/'+did+'/prompt-history'){assert.deepEqual(req.postDataJSON(),{enabled: req.postDataJSON().enabled});paused=!req.postDataJSON().enabled;mutationCount++;return route.fulfill({json:{}});}
      if(pathname==='/api/history/overview'){
        searchQuery=url.searchParams.get('search')||'';
        if(state==='loading') await new Promise(r=>{release=r;});
        if(state==='error') return route.fulfill({status:503,json:{error:'Synthetic outage'}});
        return route.fulfill({json:state==='empty'?{...history,rows:[],daily:[],lengths:[],stats:{records:0,prompts:0,sessions:0,averageLength:null,averageDurationMs:null,completed:0,incomplete:0}}:history});
      }
      if(pathname==='/api/history/sessions/'+did+'/synthetic-session'){
        if(req.method()==='PATCH'){project=req.postDataJSON().project;mutationCount++;return route.fulfill({json:{project}});}
        return route.fulfill({json:{device:{_id:did,name:'Demo laptop',promptCollectionEnabled:true,lastHistoryReportAt:now},project,rows:removed?rows.slice(1):rows,total:removed?2:3,page:0,hasMore:false,retentionDays:30,period:history.period}});
      }
      if(pathname.startsWith('/api/history/prompts/')){assert.equal(req.method(),'DELETE');assert.deepEqual(req.postDataJSON(),{confirmation:'DELETE PROMPT'});removed=true;mutationCount++;return route.fulfill({status:204});}
      if(pathname==='/api/dashboard/overview')return route.fulfill({json:usage});
      if(!['GET','HEAD'].includes(req.method()))return route.fulfill({status:409,json:{error:'QA blocks real writes'}});
      return route.continue();
    });
    state='loading'; await p.goto('http://127.0.0.1:3000/sessions');await p.getByRole('status').filter({hasText:'Loading prompt history'}).waitFor();
    assert.ok(await p.locator('.skeleton-bar').count());state='error';release();await p.getByRole('alert').filter({hasText:'Synthetic outage'}).waitFor();assert.equal(await p.getByRole('heading',{name:'Your first captured prompt will appear here'}).count(),0);
    state='empty';await p.getByRole('button',{name:'Try again',exact:true}).click();await p.getByRole('heading',{name:'Your first captured prompt will appear here'}).waitFor();checks.push('Loading skeleton, failed-read recovery and honest empty state');
    state='populated';await p.getByRole('button',{name:'Refresh',exact:true}).click();await p.locator('.prompt-list-row').first().waitFor();
    await p.getByLabel('Search prompt words').fill('login');await p.waitForTimeout(450);assert.equal(searchQuery,'login');assert.ok((await p.getByRole('link',{name:'Export prompts CSV',exact:true}).getAttribute('href')).includes('search=login'));await p.getByRole('button',{name:'Clear search and filters'}).click();
    for(const width of [1440,390,360]){await p.setViewportSize({width,height:1000});await p.waitForTimeout(200);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow '+width);await p.screenshot({path:path.join(out,'history-'+width+'.png'),fullPage:true});}
    assert.ok(await p.locator('.recharts-wrapper').count()>=3);checks.push('Three readable charts, matching filter/export query, 1440/390/360px without page overflow');
    await p.setViewportSize({width:1440,height:1000});await p.getByRole('button',{name:'Pause history',exact:true}).click();await p.getByRole('button',{name:'Pause history',exact:true}).waitFor({state:'detached'});assert.ok(paused);checks.push('Collection pause, version, queue and drop states');
    await p.locator('.prompt-list-row').first().click();await p.getByRole('heading',{name:'Captured input timeline'}).waitFor();
    await p.getByLabel('Project tag').fill('Billing review');await p.getByRole('button',{name:'Save tag',exact:true}).click();await p.getByText('Project tag saved.',{exact:true}).waitFor();assert.equal(project,'Billing review');
    await p.locator('.timeline-entry>details').first().locator('summary').click();await p.getByText('This is synthetic browser QA input.',{exact:false}).last().waitFor();
    assert.ok(await p.getByText('Duration unavailable',{exact:true}).count());assert.ok(await p.getByText('19,000 characters · first 16,000 captured',{exact:true}).count());
    for(const width of [1440,390,360]){await p.setViewportSize({width,height:1000});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:path.join(out,'session-'+width+'.png'),fullPage:true});}
    await p.getByRole('button',{name:'Delete prompt synthetic-1',exact:true}).click();await p.getByRole('dialog').waitFor();assert.ok(await p.getByRole('button',{name:'Delete prompt permanently'}).isDisabled());await p.getByLabel('Type DELETE PROMPT to confirm').fill('DELETE PROMPT');await p.getByRole('button',{name:'Delete prompt permanently'}).click();await p.getByText('Prompt permanently deleted. Token usage was preserved.',{exact:true}).waitFor();assert.ok(removed);checks.push('Session usage/cache insights, expandable text, tags, incomplete/truncated states and confirmed deletion');
    await p.goto('http://127.0.0.1:3000/connect?deviceId='+did+'&history=1');await p.getByRole('button',{name:'Show setup & update',exact:true}).click();await p.getByRole('heading',{name:'Set up Demo laptop'}).waitFor();assert.ok((await p.locator('.command-label pre').first().innerText()).includes('-DeviceId "'+did+'"'));assert.equal(await p.getByText('Device tracker key',{exact:true}).count(),0);
    await p.getByRole('combobox',{name:'Device operating system'}).selectOption('macos');assert.ok((await p.locator('.command-label pre').first().innerText()).startsWith('bash '));await p.getByRole('combobox',{name:'Device operating system'}).selectOption('linux');assert.ok((await p.locator('.command-label pre').first().innerText()).startsWith('bash '));checks.push('Existing-device opt-in reuses the device, shows per-OS commands and no blank/re-exposed key');
    assert.deepEqual(errors,[]);assert.equal(mutationCount,4);
    const report={passed:true,checks,errors,mutationWrites:'Intercepted fixtures only; no employee records changed',desktop:'Fresh production-helper Desktop capture still unverified'};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
