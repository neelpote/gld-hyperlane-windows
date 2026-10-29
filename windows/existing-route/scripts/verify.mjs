import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
import { Contract, FetchRequest, JsonRpcProvider, ZeroAddress, formatEther, formatUnits, getAddress, zeroPadValue } from 'ethers';

const record = JSON.parse(readFileSync('deployments/gold.json', 'utf8'));
const route = parse(readFileSync('registry/deployments/warp_routes/GLD/bsctestnet-sepolia-config.yaml', 'utf8'));
const deploy = parse(readFileSync('registry/deployments/warp_routes/GLD/bsctestnet-sepolia-deploy.yaml', 'utf8'));
const abi = ['function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function totalSupply() view returns (uint256)', 'function balanceOf(address) view returns (uint256)'];
const routerAbi = [...abi, 'function owner() view returns (address)', 'function mailbox() view returns (address)', 'function interchainSecurityModule() view returns (address)', 'function routers(uint32) view returns (bytes32)', 'function wrappedToken() view returns (address)'];
const providers = [];

try {
  const results = await Promise.all(route.tokens.map(async leg => {
    const metadata = parse(readFileSync(`registry/chains/${leg.chainName}/metadata.yaml`, 'utf8'));
    const request = new FetchRequest(process.env[leg.chainName === 'bsctestnet' ? 'BSC_TESTNET_RPC' : 'SEPOLIA_RPC'] || metadata.rpcUrls[0].http);
    request.timeout = 20000;
    const provider = new JsonRpcProvider(request);
    providers.push(provider);
    assert.equal((await provider.getNetwork()).chainId, BigInt(metadata.chainId));
    assert.notEqual(await provider.getCode(leg.addressOrDenom), '0x');
    const router = new Contract(leg.addressOrDenom, routerAbi, provider);
    assert.equal(await router.owner(), getAddress(record.owner));
    assert.equal(await router.mailbox(), getAddress(deploy[leg.chainName].mailbox));
    assert.equal(await router.interchainSecurityModule(), ZeroAddress);
    const remote = route.tokens.find(token => token.chainName !== leg.chainName);
    const remoteMetadata = parse(readFileSync(`registry/chains/${remote.chainName}/metadata.yaml`, 'utf8'));
    assert.equal((await router.routers(remoteMetadata.domainId)).toLowerCase(), zeroPadValue(remote.addressOrDenom, 32).toLowerCase());
    const tokenAddress = leg.collateralAddressOrDenom || leg.addressOrDenom;
    const token = new Contract(tokenAddress, abi, provider);
    assert.equal(await token.name(), 'Gold');
    assert.equal(await token.symbol(), 'GLD');
    assert.equal(await token.decimals(), 18n);
    const [balance, totalSupply, nativeBalance] = await Promise.all([token.balanceOf(record.owner), token.totalSupply(), provider.getBalance(record.owner)]);
    const result = { chain: leg.chainName, chainId: metadata.chainId, router: leg.addressOrDenom, token: tokenAddress, owner: record.owner, ownerGLD: formatUnits(balance, 18), totalSupplyGLD: formatUnits(totalSupply, 18), ownerNativeBalance: formatEther(nativeBalance), remoteRouterVerified: true };
    if (leg.chainName === 'bsctestnet') {
      assert.equal(await router.wrappedToken(), getAddress(record.token));
      assert.equal(totalSupply, BigInt(record.supply));
      result.lockedGLD = formatUnits(await token.balanceOf(leg.addressOrDenom), 18);
    }
    return result;
  }));
  const bsc = results.find(result => result.chain === 'bsctestnet');
  const sepolia = results.find(result => result.chain === 'sepolia');
  assert.equal(bsc.lockedGLD, sepolia.totalSupplyGLD, 'Locked collateral must equal outstanding synthetic supply');
  const report = { verifiedAt: new Date().toISOString(), backingInvariantVerified: true, chains: results };
  writeFileSync('deployments/verification.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error.shortMessage || error.message);
  process.exitCode = 1;
} finally {
  for (const provider of providers) provider.destroy();
}
