import React, {useState, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {collect, createRpc, evaluate} from './verify.js';
import {sampleRequest, sampleObservation} from './sample.js';
import './style.css';

const empty = {chainId:'1',transactionHash:'',token:'',recipient:'',amount:''};
const names = {finalized:'Matching transfer · finalized',awaiting:'Matching transfer · awaiting finality',mismatch:'Request mismatch',pending:'No mined receipt',recheck:'Recheck required'};
function App() {
  const [request,setRequest] = useState(empty), [endpoint,setEndpoint] = useState('https://eth.drpc.org');
  const [result,setResult] = useState(null), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const version = useRef(0);
  function invalidate() { version.current++; setResult(null); setError(''); }
  function edit(key,value) { invalidate(); setRequest(r=>({...r,[key]:value})); }
  async function verify(event) {
    event.preventDefault(); const current = ++version.current; setBusy(true);setError('');setResult(null);
    try { const observation = await collect(request, createRpc(endpoint)); const report = evaluate(request,observation); if (current===version.current) setResult({report,observation,source:endpoint,mode:'live'}); }
    catch (error) { if (current===version.current) { const detail = /^RPC request failed \(HTTP \d{3}\)\.$/.test(error.message) ? error.message + ' Check the provider’s access or rate limits.' : 'Confirm the request and RPC URL, then retry.'; setError('Could not complete the check. ' + detail + ' No transfer has been verified.'); } }
    finally { setBusy(false); }
  }
  function demo(kind) {
    invalidate();const observation = sampleObservation();
    if (kind==='mismatch') observation.receipt.logs[0].data='0x'+(24999999n).toString(16).padStart(64,'0');
    if (kind==='awaiting') observation.finalized.number='0x63';
    setResult({report:evaluate(sampleRequest,observation),observation,source:'Synthetic local fixture',mode:'demo'});
  }
  function download() {
    const blob = new Blob([JSON.stringify({...result,limitations:['Observation of the named RPC provider; not independent consensus proof.','Confirms one transfer event only, not invoice ownership, uniqueness, fiat receipt, token trustworthiness or current balance.']},null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);a.download=`finalitydesk-${result.mode}-${result.report.status}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  return <><header><a href="/" className="brand">FinalityDesk<span className="brandmark" aria-hidden="true">/</span></a><span>Read-only transfer reconciliation</span></header><main>
    <section className="intro"><h1>A successful transaction<br/>is only the first check.</h1><p>Compare an ERC-20 transfer with the request you expected. <br/>Keep the network, amount and finality evidence together.</p></section>
    <div className="workspace"><section className="request"><div className="section-title"><span>01</span><h2>The request</h2></div><form onSubmit={verify}>
      <label>Network<select value={request.chainId} onChange={e=>edit('chainId',e.target.value)}><option value="1">Ethereum Mainnet · Chain 1</option></select></label>
      <label>Transaction hash<input required value={request.transactionHash} onChange={e=>edit('transactionHash',e.target.value.trim())} placeholder="0x…" pattern="0x[0-9a-fA-F]{64}" spellCheck="false" autoComplete="off" /></label>
      <label>Expected token contract<input required value={request.token} onChange={e=>edit('token',e.target.value.trim())} placeholder="Contract address, not a token symbol" pattern="0x[0-9a-fA-F]{40}" spellCheck="false" autoComplete="off" /></label>
      <label>Expected recipient<input required value={request.recipient} onChange={e=>edit('recipient',e.target.value.trim())} placeholder="0x…" pattern="0x[0-9a-fA-F]{40}" spellCheck="false" autoComplete="off" /></label>
      <label>Expected amount in base units<input required value={request.amount} onChange={e=>edit('amount',e.target.value.trim())} placeholder="25000000" inputMode="numeric" pattern="[1-9][0-9]*" /><small>Use the token’s integer units. For a 6-decimal token, 25 tokens = 25000000.</small></label>
      <details><summary>RPC source & privacy</summary><label>HTTPS RPC URL<input required type="url" value={endpoint} onChange={e=>{invalidate();setEndpoint(e.target.value)}} /></label><p>The provider receives your IP address and transaction hash. Expected recipient, contract and amount are compared in this browser. No wallet connection.</p></details>
      <button className="primary" disabled={busy}>{busy?'Checking chain evidence…':'Check transfer'}</button>{error&&<p role="alert" className="error">{error}</p>}
    </form></section>
    <section className="evidence" aria-live="polite"><div className="section-title"><span>02</span><h2>The evidence</h2></div>{result ? <>
      <div className={`verdict ${result.report.status}`}><p className="source-label">{result.mode==='demo'?'SYNTHETIC DEMO · NO CHAIN QUERY':'LIVE RPC OBSERVATION'}</p><h3>{names[result.report.status]}</h3><p>{result.report.summary}</p></div>
      <ol className="checks">{result.report.checks.map(c=><li key={c.name}><span className={c.ok?'pass':'fail'}>{c.ok?'PASS':'CHECK'}</span><div><strong>{c.name}</strong><p>{c.detail}</p></div></li>)}</ol>
      <dl className="metadata"><dt>Observed</dt><dd>{new Date(result.report.observedAt).toLocaleString()}</dd><dt>Source</dt><dd>{result.source}</dd><dt>Request amount</dt><dd>{result.report.expected.amount} base units</dd></dl><button className="secondary" onClick={download}>Export evidence JSON</button>
      <details><summary>Inspect report</summary><pre>{JSON.stringify(result.report,null,2)}</pre></details>
    </> : <div className="empty"><div className="empty-rule"/><h3>Every part of the request matters.</h3><p>A matching transfer must use the right network, contract, recipient and exact amount. Finality is checked separately.</p><p>Your report will appear here.</p></div>}
      <aside><strong>What this report means</strong><p>A point-in-time observation from one RPC provider. It identifies a transfer event; it does not establish invoice ownership, prevent reuse for another invoice, certify a token or prove cash received.</p></aside>
    </section></div>
    <section className="demo"><div><h2>Try the edge cases.</h2><p>Synthetic examples run locally. They do not query the chain or change your request.</p></div><div className="demo-buttons"><button onClick={()=>demo('finalized')}>Matching + finalized</button><button onClick={()=>demo('mismatch')}>One unit short</button><button onClick={()=>demo('awaiting')}>Not yet finalized</button></div></section>
  </main><footer><span>FinalityDesk · Working prototype</span><a href="https://eips.ethereum.org/EIPS/eip-20" target="_blank" rel="noreferrer">ERC-20 specification</a></footer></>;
}
createRoot(document.getElementById('root')).render(<App/>);
