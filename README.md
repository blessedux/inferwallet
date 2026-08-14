# SZX / InferWallet

**InferWallet** turns the Stellar classic asset **SZX** into permissionless AI inference spend: hold SZX in Freighter, point Cursor at a local proxy, and burn SZX to call OpenRouter models — no product accounts, API keys, or credit cards.

Domain language (SZX, InferWallet, Infer Proxy, Companion, Treasury Absorb, Pass-Through, Pay-to-Sink, Request Binding, Prepay, Tier, Fixed USD Feel, SDEX Quote) lives in [CONTEXT.md](./CONTEXT.md). Grant narrative: [docs/grant-proposal-szx-inferwallet.md](./docs/grant-proposal-szx-inferwallet.md).

## Packages

| Package | Role |
| --- | --- |
| `packages/infer-proxy` | Local OpenAI-compatible Node process Cursor points at |
| `packages/companion` | InferWallet web app for Freighter + swap + burn |
| `packages/sdk` | SDEX quote, Pay-to-Sink builder, swap builder, chain verify |

No Soroban `/contracts` package in V1 — SZX is a classic Stellar asset.

## Testnet SZX

Issuance + SDEX seed runbook: [docs/testnet-szx-runbook.md](./docs/testnet-szx-runbook.md). Public ids: [docs/testnet-assets.json](./docs/testnet-assets.json).

```bash
bun run issue:szx   # once — writes .secrets/ (vault immediately)
bun run seed:sdex   # 15M SZX asks @ $0.01 USDC
# After you fund distributor with ~150k classic testnet USDC:
bun run seed:sdex -- --with-bids
```

## Develop

```bash
bun install
bun run typecheck
bun run dev:proxy      # http://localhost:8787
bun run dev:companion  # http://localhost:5173 (InferWallet app)
```

Full walkthrough: [docs/setup.md](./docs/setup.md). Requires USDC + SZX trustlines in Freighter for swap.

## Production Deployment

- **Companion (Static Site):** Auto-deploys to Vercel on push to `main`
- **Proxy (API Server):** Deploy to Railway — see [docs/railway-deployment.md](docs/railway-deployment.md)

After deploying the proxy, set `VITE_PROXY_URL` in Vercel to your Railway URL.

Product tracking: Exponential **SZX** (`szx`) under Sozu Capital.
