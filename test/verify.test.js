import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,normalizeRequest,collect,createRpc} from '../src/verify.js';
import {sampleRequest as request,sampleObservation} from '../src/sample.js';
test('one exact finalized transfer',()=>assert.equal(evaluate(request,sampleObservation()).status,'finalized'));
const mutations = {
  'wrong chain': o=>o.chainId='0xaa36a7',
  'wrong contract': o=>o.receipt.logs[0].address='0x'+'7'.repeat(40),
  'wrong recipient': o=>o.receipt.logs[0].topics[2]='0x'+'0'.repeat(24)+'7'.repeat(40),
  'one unit short': o=>o.receipt.logs[0].data='0x'+(24999999n).toString(16).padStart(64,'0'),
  'reverted receipt': o=>o.receipt.status='0x0',
  'pending': o=>o.receipt=null,
  'missing status': o=>delete o.receipt.status,
  'wrong transaction': o=>o.receipt.transactionHash='0x'+'9'.repeat(64),
  'wrong receipt block hash': o=>o.receipt.blockHash='0x'+'9'.repeat(64),
  'reorg during lookup': o=>o.canonicalAfter.hash='0x'+'9'.repeat(64),
  'missing transaction membership': o=>o.canonicalAfter.transactions=[],
  'no finalized support': o=>o.finalized=null,
  'unfinalized': o=>o.finalized.number='0x63',
  'conflicting finalized head': o=>o.finalized.number='0x64',
  'removed log': o=>o.receipt.logs[0].removed=true,
  'duplicate log': o=>o.receipt.logs.push(structuredClone(o.receipt.logs[0])),
  'ambiguous exact matches': o=>{const l=structuredClone(o.receipt.logs[0]);l.logIndex='0x1';o.receipt.logs.push(l)},
  'NFT shape': o=>o.receipt.logs[0].topics.push('0x'+'0'.repeat(64)),
  'malformed data': o=>o.receipt.logs[0].data='0x17d7840',
  'padded quantity': o=>o.chainId='0x01',
  'address nonzero high bytes': o=>o.receipt.logs[0].topics[2]='0x'+'1'.repeat(24)+'4'.repeat(40),
  'contradictory log block': o=>o.receipt.logs[0].blockNumber='0x65',
};
for(const [name,mutate] of Object.entries(mutations)) test(name+' cannot become finalized',()=>{const o=sampleObservation();mutate(o);assert.notEqual(evaluate(request,o).status,'finalized')});
test('exact big integers above float precision',()=>{const r={...request,amount:'9007199254740993'};const o=sampleObservation();o.receipt.logs[0].data='0x'+BigInt(r.amount).toString(16).padStart(64,'0');assert.equal(evaluate(r,o).status,'finalized');assert.equal(evaluate({...r,amount:'9007199254740992'},o).status,'mismatch')});
test('invalid amounts rejected',()=>{for(const amount of ['0','1.2','1e6','-1','01','2,000',(2n**256n).toString()])assert.throws(()=>normalizeRequest({...request,amount}))});
test('collection never calls a write RPC method',async()=>{const o=sampleObservation(),methods=[];const rpc=async(m,p)=>{methods.push(m);if(m==='eth_chainId')return o.chainId;if(m==='eth_getTransactionReceipt')return o.receipt;return p[0]==='finalized'?o.finalized:o.canonical};assert.equal(evaluate(request,await collect(request,rpc)).status,'finalized');assert.deepEqual(methods,['eth_chainId','eth_getTransactionReceipt','eth_getBlockByNumber','eth_getBlockByNumber','eth_getBlockByNumber'])});
test('invalid RPC envelopes rejected',async()=>{for(const data of [{jsonrpc:'2.0',id:99,result:'0x1'},{jsonrpc:'2.0',id:1,error:{code:-1}},{id:1,result:'0x1'}]){const rpc=createRpc('https://example.com',async()=>({ok:true,text:async()=>JSON.stringify(data)}));await assert.rejects(rpc('eth_chainId',[]))}});
test('credential-bearing URLs rejected',()=>{for(const url of ['http://example.com','https://a:b@example.com','https://example.com?key=x'])assert.throws(()=>createRpc(url))});
