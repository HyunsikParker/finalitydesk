export const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const address = /^0x[0-9a-fA-F]{40}$/;
const hash = /^0x[0-9a-fA-F]{64}$/;
const quantity = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const uint = (v) => typeof v === 'string' && quantity.test(v) && v.length <= 66;
const wordAddress = (v) => typeof v === 'string' && /^0x0{24}[0-9a-fA-F]{40}$/.test(v);
function assert(ok, message) { if (!ok) throw new Error(message); }

export function normalizeRequest(input) {
  assert(/^[1-9][0-9]{0,19}$/.test(input.chainId), 'Chain ID must be a positive integer.');
  assert(hash.test(input.transactionHash), 'Enter a 32-byte transaction hash.');
  assert(address.test(input.token), 'Enter a 20-byte token contract address.');
  assert(address.test(input.recipient), 'Enter a 20-byte recipient address.');
  assert(/^(0|[1-9][0-9]{0,77})$/.test(input.amount), 'Amount must use integer base units, without commas or decimals.');
  assert(BigInt(input.amount) > 0n && BigInt(input.amount) < 2n ** 256n, 'Amount must be between 1 and uint256 max.');
  return Object.fromEntries(['chainId','transactionHash','token','recipient','amount'].map(k => [k, input[k].toLowerCase()]));
}

// A report is an observation of one RPC provider, not a consensus proof or an invoice settlement record.
export function evaluate(request, observation) {
  const expected = normalizeRequest(request);
  const checks = [];
  const report = (status, summary, extra = {}) => ({schemaVersion: 1, status, summary, expected, observedAt: observation.observedAt, checks, ...extra});
  const check = (name, ok, detail) => { checks.push({name, ok, detail}); return ok; };
  const { chainId, receipt, canonical, finalized, canonicalAfter } = observation;
  if (!uint(chainId)) return report('recheck', 'The provider returned an invalid chain ID.');
  if (!check('Network', BigInt(chainId) === BigInt(expected.chainId), `Expected chain ${expected.chainId}; observed ${BigInt(chainId)}`)) return report('mismatch', 'The RPC network does not match the request.');
  if (receipt == null) return report('pending', 'No mined receipt was found. The transaction may be pending, unknown, or on another network.');
  if (!hash.test(receipt.transactionHash) || !equal(receipt.transactionHash, expected.transactionHash) || !hash.test(receipt.blockHash) || !uint(receipt.blockNumber) || !Array.isArray(receipt.logs) || receipt.logs.length > 10000 || !['0x0','0x1'].includes(receipt.status)) return report('recheck', 'The receipt is incomplete or contradicts the requested transaction.');
  if (!check('Execution', receipt.status === '0x1', receipt.status === '0x1' ? 'Execution succeeded' : 'Execution reverted')) return report('mismatch', 'This transaction reverted.');
  const canonicalMatches = (b) => b && uint(b.number) && hash.test(b.hash) && b.number === receipt.blockNumber && equal(b.hash, receipt.blockHash) && Array.isArray(b.transactions) && b.transactions.some(t => equal(t, expected.transactionHash));
  if (!check('Canonical block', canonicalMatches(canonical) && canonicalMatches(canonicalAfter), 'Receipt block and transaction membership checked before and after finality lookup')) return report('recheck', 'The receipt could not be bound to a stable canonical block.');
  const logs = [];
  const indices = new Set();
  for (const log of receipt.logs) {
    if (!address.test(log.address) || !Array.isArray(log.topics)) return report('recheck', 'Malformed log in receipt.');
    if (!equal(log.address, expected.token) || !equal(log.topics[0], TRANSFER)) continue;
    if (log.removed !== false || !equal(log.transactionHash, expected.transactionHash) || !equal(log.blockHash, receipt.blockHash) || log.blockNumber !== receipt.blockNumber || !uint(log.logIndex) || indices.has(log.logIndex) || log.topics.length !== 3 || !wordAddress(log.topics[1]) || !wordAddress(log.topics[2]) || !hash.test(log.data)) return report('recheck', 'A token transfer log is malformed, removed, duplicated, or inconsistent.');
    indices.add(log.logIndex);
    logs.push({logIndex: log.logIndex, from: '0x' + log.topics[1].slice(-40).toLowerCase(), recipient: '0x' + log.topics[2].slice(-40).toLowerCase(), amount: BigInt(log.data).toString()});
  }
  const matching = logs.filter(l => equal(l.recipient, expected.recipient) && l.amount === expected.amount);
  if (!check('Requested transfer', matching.length === 1, `${matching.length} exact matches across ${logs.length} valid transfer logs from the requested contract`)) return report(matching.length > 1 ? 'recheck' : 'mismatch', matching.length > 1 ? 'Multiple transfers match. Select a specific transfer outside this report before reconciling.' : 'No single transfer matches both the recipient and exact amount.', {transfers: logs});
  if (!finalized || !uint(finalized.number) || !hash.test(finalized.hash)) return report('recheck', 'The provider did not supply a valid finalized block.', {transfer: matching[0]});
  if (BigInt(finalized.number) === BigInt(receipt.blockNumber) && !equal(finalized.hash, receipt.blockHash)) return report('recheck', 'Finalized and receipt block hashes conflict.');
  const isFinal = BigInt(finalized.number) >= BigInt(receipt.blockNumber);
  check('Finality', isFinal, `Receipt block ${BigInt(receipt.blockNumber)}; finalized block ${BigInt(finalized.number)}`);
  return report(isFinal ? 'finalized' : 'awaiting', isFinal ? 'One requested transfer matches in a block at or below the provider’s finalized head.' : 'The transfer matches, but its block is above the finalized head.', {transfer: matching[0], block: {number: receipt.blockNumber, hash: receipt.blockHash}, finalized: {number: finalized.number, hash: finalized.hash}});
}

export function createRpc(url, fetcher = fetch) {
  const endpoint = new URL(url);
  assert(endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash, 'Use an HTTPS RPC URL without credentials, query parameters, or fragments.');
  let id = 0;
  return async (method, params) => {
    const current = ++id;
    const response = await fetcher(endpoint.href, {method:'POST', credentials:'omit', referrerPolicy:'no-referrer', headers:{'Content-Type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0', id:current, method, params}), signal:AbortSignal.timeout(12000)});
    assert(response.ok, `RPC request failed (HTTP ${response.status}).`);
    const raw = await response.text();
    assert(raw.length < 3000000, 'RPC response exceeds the supported size.');
    const data = JSON.parse(raw);
    assert(data.jsonrpc === '2.0' && data.id === current && !data.error && Object.hasOwn(data, 'result'), `RPC method ${method} is unavailable or returned an invalid response.`);
    return data.result;
  };
}

export async function collect(request, rpc) {
  const expected = normalizeRequest(request);
  const chainId = await rpc('eth_chainId', []);
  if (!uint(chainId) || BigInt(chainId) !== BigInt(expected.chainId)) return {chainId, observedAt: new Date().toISOString()};
  const receipt = await rpc('eth_getTransactionReceipt', [expected.transactionHash]);
  if (!receipt || !uint(receipt.blockNumber)) return {chainId, receipt, observedAt: new Date().toISOString()};
  const canonical = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
  let finalized = null;
  try { finalized = await rpc('eth_getBlockByNumber', ['finalized', false]); } catch { /* An unavailable finality tag cannot produce a finalized result. */ }
  const canonicalAfter = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
  return {chainId, receipt, canonical, finalized, canonicalAfter, observedAt: new Date().toISOString()};
}
