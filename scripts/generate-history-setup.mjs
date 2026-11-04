import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const engine=fs.readFileSync(path.join(root,'public/history-client.py'),'utf8').replaceAll('\r\n','\n');
if(engine.includes("'''"))throw Error('Client source must not close its embedded raw string');
const template=fs.readFileSync(path.join(root,'scripts/history-setup-template.py'),'utf8').replaceAll('\r\n','\n');
fs.writeFileSync(path.join(root,'public/setup-history.py'),template.replace('# __HISTORY_CLIENT_SOURCE__',"CLIENT_SOURCE = r'''\n"+engine+"\n'''"));
console.log('Generated standalone cross-platform prompt history setup.');
