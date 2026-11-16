// Points git at the tracked hooks directory. Refuses when that directory is missing: a checkout
// created before .githooks was committed would otherwise get a core.hooksPath that git silently
// treats as "no hooks", so the UTF-8 guard would never run and nothing would say so.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const DIR = '.githooks';
const HOOK = DIR + '/pre-commit';

if (!existsSync(HOOK)) {
  console.error('install-hooks: ' + HOOK + ' does not exist, so there is nothing to install.');
  console.error('  This checkout predates the tracked hooks. Pull the commit that adds ' + DIR + '/,');
  console.error('  then run: npm run hooks:install');
  process.exit(1);
}

try {
  execFileSync('git', ['config', 'core.hooksPath', DIR], { stdio: 'inherit' });
} catch {
  console.error('install-hooks: git config failed — is this a git checkout?');
  process.exit(1);
}

// Ask git where the path actually resolves to; that is what it will exec.
let resolved = '';
try {
  resolved = execFileSync('git', ['config', '--path', '--get', 'core.hooksPath'], { encoding: 'utf8' }).trim();
} catch {
  resolved = '';
}

if (!resolved || !existsSync(resolved)) {
  console.error('install-hooks: core.hooksPath is set to ' + JSON.stringify(DIR) + ' but git resolves it to ' +
    JSON.stringify(resolved) + ', which does not exist.');
  console.error('  Unset it with: git config --unset core.hooksPath');
  process.exit(1);
}

console.log('install-hooks: core.hooksPath = ' + DIR + ' (' + resolved + ')');
console.log('install-hooks: pre-commit runs scripts/check-utf8.mjs --staged');
