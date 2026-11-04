import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const engine=fs.readFileSync(path.join(root,'public/setup-unified.py'),'utf8').replaceAll('\r\n','\n');
for(const [file,os,label] of [['setup-macos.sh','Darwin','macOS'],['setup-linux.sh','Linux','Linux']]){
 const source=`#!/usr/bin/env bash
# Usage ledger ${label} setup. Review before running. No sudo, shell profile edits or network calls.
set -euo pipefail
if [ "$(uname -s)" != "${os}" ]; then
  printf '%s\\n' 'This download is for ${label}. Choose the matching operating system in the dashboard.' >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\\n' 'Python 3.8+ is required. Install it using your organization-approved method, then rerun. No settings changed.' >&2
  exit 1
fi
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,8) else 1)' || { printf '%s\\n' 'Python 3.8+ required. No settings changed.' >&2; exit 1; }
exec python3 -c "$(cat <<'USAGE_TRACKER_PY'
${engine}
USAGE_TRACKER_PY
)" "$@"
`;
 fs.writeFileSync(path.join(root,'public',file),source);
}
console.log('Generated standalone macOS and Linux unified installers.');
