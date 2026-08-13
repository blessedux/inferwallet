# SZX / InferWallet

Permissionless AI inference spend on Stellar. Hold **SZX**, pay via Freighter in a local **Companion**, get Cursor completions through a local **Infer Proxy**.

Domain language (SZX, InferWallet, Infer Proxy, Companion, Treasury Absorb, Pass-Through, Pay-to-Sink, Request Binding, Prepay, Tier, Fixed USD Feel, SDEX Quote) lives in [CONTEXT.md](./CONTEXT.md). Grant narrative: [docs/grant-proposal-szx-inferwallet.md](./docs/grant-proposal-szx-inferwallet.md).

## Packages

| Package | Role |
| --- | --- |
| `packages/infer-proxy` | Local OpenAI-compatible Node process Cursor points at |
| `packages/companion` | Localhost UI for Freighter + tier + payment approval |
| `packages/sdk` | Thin helpers: SDEX Quote, Pay-to-Sink build/verify |

No Soroban `/contracts` package in V1 — SZX is a classic Stellar asset.

## Develop

```bash
bun install
bun run typecheck
bun run dev:proxy      # http://localhost:8787
bun run dev:companion  # http://localhost:5173
```

Product tracking: Exponential **SZX** (`szx`) under Sozu Capital.
