# Setup — local InferWallet testnet loop

Domain terms match [`CONTEXT.md`](../CONTEXT.md): **SZX**, **Infer Proxy**, **Companion**, **Pay-to-Sink**, **Request Binding**, **Tier**, **Fixed USD Feel**, **SDEX Quote**, **Treasury Absorb**, **Prepay**.

## Prerequisites

- Bun ≥ 1.1
- Freighter browser extension (Testnet network)
- Cursor (or any OpenAI-compatible client)
- Optional: OpenRouter API key (operator) for real completions; without it the proxy uses a stub backend

## 1. Issue testnet SZX + seed SDEX

```bash
bun install
cp .env.example .env
# Fill OPENROUTER_API_KEY (operator), leave SKIP_CHAIN_VERIFY=1 for local demos

bun run issue:szx   # once — generates issuer/distributor/sink → .secrets/
bun run seed:sdex   # 15M SZX asks @ $0.01 USDC
```

After seeding, vault `.secrets/szx-testnet.json` and delete the local copy. See [testnet-szx-runbook.md](./testnet-szx-runbook.md) for two-sided book (requires 150k classic USDC on distributor).

## 2. Run proxy + InferWallet app

```bash
bun run dev:proxy      # terminal 1 — OpenAI-compat local proxy
bun run dev:companion  # terminal 2 — InferWallet web UI
```

Open http://localhost:5173. Connect Freighter (Testnet), swap USDC → SZX, copy the base URL, load credits, and configure Cursor.

## 3. Freighter setup (Testnet)

**Required trustlines:**  
- **USDC** — `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` (for swap)  
- **SZX** — see `asset.issuer` in [`testnet-assets.json`](./testnet-assets.json) (for holding/burning)

1. Freighter → Testnet
2. **Add asset USDC** with the issuer above
3. **Add asset SZX** with the issuer from `testnet-assets.json`
4. Fund USDC from a testnet faucet or transfer from another testnet wallet
5. Swap USDC → SZX in the InferWallet UI

## 4. Cursor → local proxy

InferWallet app shows the base URL to copy. In Cursor:

1. **Settings** → **Models** → **Override OpenAI Base URL**
2. Paste `http://127.0.0.1:8787/v1`
3. **OpenAI API Key** → any dummy key (e.g. `sk-test`)
4. Select a model tier (Cheap/Balanced/Premium) in the InferWallet app
5. Load credits (burn SZX → prepay balance) or approve per-request

## 5. Verify

Ask Cursor for a completion. The proxy gates on SZX payment:

- **Prepay balance** — instant fulfillment while credits remain
- **No balance** — pending approval in InferWallet UI, then settlement on-chain

Check the Usage section in InferWallet to see session history and token counts.

## Tiers

| Tier | Fixed USD Feel | Env model id |
| --- | --- | --- |
| Cheap | $0.01 | `TIER_MODEL_CHEAP` |
| Balanced | $0.03 | `TIER_MODEL_BALANCED` |
| Premium | $0.10 | `TIER_MODEL_PREMIUM` |

## Optional: fund wallet from distributor

```bash
npx tsx scripts/fund-freighter-szx.ts G... 1000
```

Sends 1000 SZX (~$10 at testnet 0.01/SZX) to the wallet. Requires SZX trustline already set up. For USDC, use a testnet faucet or transfer from another wallet.

Without USDC / SZX balance or trustlines, swap and burn operations fail with Horizon `op_underfunded` or `op_no_trust`.

## Operator references

- [Treasury Absorb (V1)](./treasury-absorb.md)
- [Spend guards](./operator-spend-guards.md)
- [Settlement vs provider failures](./settlement-policy.md)
- [V1.2 Pass-Through migration](./pass-through-v1.2.md) — **not implemented in V1**
