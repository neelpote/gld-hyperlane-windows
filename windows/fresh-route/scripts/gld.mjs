import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import solc from 'solc';
import { parse as parseYaml } from 'yaml';
import { Contract, ContractFactory, FetchRequest, JsonRpcProvider, Wallet, ZeroAddress, formatEther, getAddress, parseUnits } from 'ethers';

const OWNER = '0x3ae38EDD6eDfD90180EC897cbF0C5BA527459C83';
const routeFile = 'registry/deployments/warp_routes/GLD/bsctestnet-sepolia-deploy.yaml';
const deploymentFile = 'deployments/gold.json';
const chains = {
  bsctestnet: { id: 97, rpc: process.env.BSC_TESTNET_RPC || 'https://bsc-testnet.publicnode.com' },
  sepolia: { id: 11155111, rpc: process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com' },
};

function save(path, value) {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

function settings() {
  const owner = getAddress(process.env.OWNER_ADDRESS || OWNER);
  assert.notEqual(owner, ZeroAddress, 'Owner must be nonzero');
  const supply = parseUnits(process.env.GLD_SUPPLY || '1000000', 18);
  assert(supply > 0n, 'Supply must be positive');
  return { owner, supply };
}

function compile() {
  const input = {
    language: 'Solidity',
    sources: { 'Gold.sol': { content: readFileSync('contracts/Gold.sol', 'utf8') } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), {
    import: path => {
      if (!path.startsWith('@openzeppelin/contracts/')) return { error: 'Unexpected import' };
      return { contents: readFileSync(resolve('node_modules', path), 'utf8') };
    },
  }));
  const errors = (output.errors || []).filter(e => e.severity === 'error');
  assert.equal(errors.length, 0, errors.map(e => e.formattedMessage).join('\n'));
  const contract = output.contracts['Gold.sol'].Gold;
  const artifact = { compiler: solc.version(), abi: contract.abi, bytecode: '0x' + contract.evm.bytecode.object };
  save('artifacts/Gold.json', artifact);
  console.log('Compiled Gold.sol with optimizer and Paris EVM target.');
  return artifact;
}

async function inspect(name, chain, owner) {
  const request = new FetchRequest(chain.rpc);
  request.timeout = 20000;
  const provider = new JsonRpcProvider(request);
  try {
    const network = await provider.getNetwork();
    assert.equal(network.chainId, BigInt(chain.id), `${name}: wrong chain`);
    const addresses = parseYaml(readFileSync(`registry/chains/${name}/addresses.yaml`, 'utf8'));
    assert.notEqual(await provider.getCode(addresses.mailbox), '0x', `${name}: missing mailbox code`);
    const mailbox = new Contract(addresses.mailbox, ['function localDomain() view returns (uint32)', 'function defaultIsm() view returns (address)'], provider);
    assert.equal(await mailbox.localDomain(), BigInt(chain.id), `${name}: wrong mailbox domain`);
    const ism = await mailbox.defaultIsm();
    assert.notEqual(ism, ZeroAddress, `${name}: zero default ISM`);
    assert.notEqual(await provider.getCode(ism), '0x', `${name}: missing ISM code`);
    const balance = await provider.getBalance(owner);
    console.log(`${name}: chain/domain ${chain.id}, mailbox verified, default ISM ${ism}, owner gas balance ${formatEther(balance)}`);
    return { name, balance };
  } finally {
    provider.destroy();
  }
}

async function preflight() {
  const { owner } = settings();
  console.log(`Owner and supply recipient: ${owner}`);
  const results = await Promise.allSettled(Object.entries(chains).map(([name, chain]) => inspect(name, chain, owner)));
  const failures = results.filter(r => r.status === 'rejected');
  for (const failure of failures) console.error(failure.reason.shortMessage || failure.reason.message);
  assert.equal(failures.length, 0, 'RPC preflight failed; update RPC URLs in .env and retry');
  return results.map(r => r.value);
}

async function deploy() {
  assert(!existsSync(deploymentFile), 'Existing deployment record found; reuse it instead of deploying another supply.');
  assert(process.env.HYP_KEY, 'Set HYP_KEY locally in .env; do not send it in chat.');
  const { owner, supply } = settings();
  const wallet = new Wallet(process.env.HYP_KEY);
  assert.equal(wallet.address, owner, 'Use the owner wallet for deployment and subsequent bridge tests.');
  const checks = await preflight();
  assert(checks.every(c => c.balance > 0n), 'Fund owner with test BNB and Sepolia ETH first.');
  const artifact = compile();
  const request = new FetchRequest(chains.bsctestnet.rpc);
  request.timeout = 20000;
  const provider = new JsonRpcProvider(request);
  try {
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet.connect(provider));
    const tx = await factory.getDeployTransaction(owner, supply);
    const gas = await provider.estimateGas({ ...tx, from: owner });
    const fees = await provider.getFeeData();
    const gasPrice = fees.maxFeePerGas || fees.gasPrice;
    assert(gasPrice, 'RPC did not provide gas prices');
    assert(await provider.getBalance(owner) > gas * gasPrice * 12n / 10n, 'Insufficient BNB for estimated token deployment cost');
    console.log(`Estimated token deployment gas: ${gas}. Broadcasting to BSC TESTNET only.`);
    const token = await factory.deploy(owner, supply);
    // Persist immediately: a timeout must not silently lead to a second supply.
    const record = { chain: 'bsctestnet', chainId: 97, token: await token.getAddress(), owner, supply: supply.toString(), transactionHash: token.deploymentTransaction().hash, status: 'pending' };
    save(deploymentFile, record);
    const receipt = await token.deploymentTransaction().wait(2);
    assert.equal(receipt.status, 1, 'Token deployment reverted');
    assert.equal(await token.name(), 'Gold');
    assert.equal(await token.symbol(), 'GLD');
    assert.equal(await token.decimals(), 18n);
    assert.equal(await token.totalSupply(), supply);
    assert.equal(await token.balanceOf(owner), supply);
    record.status = 'verified';
    save(deploymentFile, record);
    const config = parseYaml(readFileSync(routeFile, 'utf8'));
    config.bsctestnet.token = record.token;
    for (const leg of Object.values(config)) leg.owner = owner;
    save(routeFile, config);
    console.log(`Gold deployed and verified: ${record.token}. Warp config updated.`);
  } finally {
    provider.destroy();
  }
}

async function test() {
  const artifact = compile();
  const { owner, supply } = settings();
  assert.equal(supply, 1000000n * 10n ** 18n);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode);
  const tx = await factory.getDeployTransaction(owner, supply);
  assert(tx.data.startsWith(artifact.bytecode));
  assert(!artifact.abi.some(item => item.type === 'function' && item.name === 'mint'), 'Fixed-supply token must not expose mint');
  const config = parseYaml(readFileSync(routeFile, 'utf8'));
  assert.deepEqual(Object.keys(config).sort(), ['bsctestnet', 'sepolia']);
  assert.equal(config.bsctestnet.type, 'collateral');
  assert.equal(config.sepolia.type, 'synthetic');
  assert.equal(config.sepolia.initialSupply ?? '0', '0');
  assert.equal(config.bsctestnet.owner, owner);
  assert.equal(config.sepolia.owner, owner);
  console.log('Checks passed: constructor encoding, no public mint, route chains/types/owners, zero initial synthetic supply.');
}

try {
  const command = process.argv[2];
  if (command === 'compile') compile();
  else if (command === 'test') await test();
  else if (command === 'preflight') await preflight();
  else if (command === 'deploy') await deploy();
  else throw new Error('Use compile, test, preflight, or deploy');
} catch (error) {
  // Provider error objects can include raw signed transactions; print only a summary.
  console.error(error.shortMessage || error.message);
  process.exitCode = 1;
}
