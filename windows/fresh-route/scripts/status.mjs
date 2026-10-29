import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, [
  'node_modules/@hyperlane-xyz/cli/bundle/index.js',
  'status', '--registry', './registry', ...process.argv.slice(2),
], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
