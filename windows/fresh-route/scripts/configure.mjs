import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { getAddress, ZeroAddress } from 'ethers';
import { parse, stringify } from 'yaml';
assert(!existsSync('deployments/gold.json'),
  'Existing deployment found. Use it; do not reset this folder.');
assert(process.env.OWNER_ADDRESS, 'Set OWNER_ADDRESS in .env first.');
const owner = getAddress(process.env.OWNER_ADDRESS);
assert.notEqual(owner, ZeroAddress);
const path = 'registry/deployments/warp_routes/GLD/' +
  'bsctestnet-sepolia-deploy.yaml';
const config = parse(readFileSync(path, 'utf8'));
for (const leg of Object.values(config)) leg.owner = owner;
config.bsctestnet.token = ZeroAddress;
config.sepolia.initialSupply = '0';
writeFileSync(path, stringify(config));
console.log('Configured fresh route for public owner: ' + owner);
