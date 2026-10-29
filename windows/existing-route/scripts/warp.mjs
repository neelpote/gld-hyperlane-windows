import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ZeroAddress, getAddress } from 'ethers';
import { parse as parseYaml } from 'yaml';

const action = process.argv[2];
assert(['deploy', 'check', 'send'].includes(action), 'Use deploy, check, or send');
const config = parseYaml(readFileSync('registry/deployments/warp_routes/GLD/bsctestnet-sepolia-deploy.yaml', 'utf8'));
assert.notEqual(config.bsctestnet.token, ZeroAddress, 'Run npm run deploy:token first; collateral token is still a placeholder.');
const record = JSON.parse(readFileSync('deployments/gold.json', 'utf8'));
assert.equal(record.status, 'verified', 'Verify the pending token deployment before deploying the route.');
assert.equal(getAddress(config.bsctestnet.token), getAddress(record.token), 'Collateral address differs from deployment record');
// Keep Hyperlane and the token deployer on the same RPC endpoints.
for (const [chain, variable] of [['bsctestnet', 'BSC_TESTNET_RPC'], ['sepolia', 'SEPOLIA_RPC']]) {
  if (process.env[variable]) {
    const path = `registry/chains/${chain}/metadata.yaml`;
    const metadata = parseYaml(readFileSync(path, 'utf8'));
    metadata.rpcUrls = [{ http: process.env[variable] }];
    writeFileSync(path, JSON.stringify(metadata, null, 2) + '\n');
  }
}
const result = spawnSync(process.execPath, [
  'node_modules/@hyperlane-xyz/cli/bundle/index.js',
  'warp', action, '--registry', './registry', '--warp-route-id', 'GLD/bsctestnet-sepolia', ...process.argv.slice(3),
], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
