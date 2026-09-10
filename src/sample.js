import { TRANSFER } from './verify.js';
const tx = '0x'+'1'.repeat(64), blockHash = '0x'+'2'.repeat(64);
export const sampleRequest = {chainId:'1',transactionHash:tx,token:'0x'+'3'.repeat(40),recipient:'0x'+'4'.repeat(40),amount:'25000000'};
export function sampleObservation() {
  const block = {number:'0x64',hash:blockHash,transactions:[tx]};
  return {chainId:'0x1',observedAt:new Date().toISOString(),receipt:{transactionHash:tx,blockHash,blockNumber:'0x64',status:'0x1',logs:[{address:sampleRequest.token,topics:[TRANSFER,'0x'+'0'.repeat(24)+'5'.repeat(40),'0x'+'0'.repeat(24)+'4'.repeat(40)],data:'0x'+BigInt(sampleRequest.amount).toString(16).padStart(64,'0'),transactionHash:tx,blockHash,blockNumber:'0x64',logIndex:'0x0',removed:false}]},canonical:block,canonicalAfter:structuredClone(block),finalized:{number:'0x70',hash:'0x'+'6'.repeat(64)}};
}
