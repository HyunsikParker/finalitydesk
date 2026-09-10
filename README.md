# FinalityDesk

Compare one ERC-20 transfer with an expected network, contract, recipient and integer amount. The browser queries a read-only Ethereum JSON-RPC endpoint, checks receipt execution and canonical block membership twice, and compares the block with the provider’s finalized head. Export includes the request, report and raw observations.

```sh
npm ci
npm test
npm run dev
```

Open the local URL printed by Vite. `npm run build` creates the static site in `dist/`.

The default RPC is [dRPC’s public Ethereum endpoint](https://drpc.org/docs/ethereum-api). You can choose another HTTPS endpoint in the form.

The three examples are labeled synthetic and make no chain request. For a live check, supply a public Ethereum transaction hash and the expected transfer fields. Amounts use exact base units; there is no floating-point conversion. The app never connects a wallet, signs a message or sends a transaction.

This is a single-provider observation, not a light client or cryptographic consensus proof. A matching event does not establish invoice ownership, prevent reuse across invoices, certify token behavior, show current balance, or prove fiat received. Tokens with unusual transfer semantics may need additional accounting. Provider availability and finalized-tag support are required. RPC providers receive the transaction hash and the client IP address. Inputs and exports stay in the browser; there is no application backend.

Protocol references: [ERC-20](https://eips.ethereum.org/EIPS/eip-20), [Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/). Built for 3rd-Web-Hack with AI-assisted implementation and local verification.
