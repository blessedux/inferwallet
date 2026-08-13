# Setup — zero to one settled completion (testnet)

Domain terms match [`CONTEXT.md`](../CONTEXT.md): **SZX**, **Infer Proxy**, **Companion**, **Pay-to-Sink**, **Request Binding**, **Tier**, **Fixed USD Feel**, **SDEX Quote**, **Treasury Absorb**, **Prepay**.

## Prerequisites

- Bun ≥ 1.1
- Freighter browser extension (Testnet network)
- Cursor (or any OpenAI-compatible client)
- Optional: OpenRouter API key (operator) for real completions; without it the proxy uses a stub backend

## 1. Install

```bash
git clone https://github.com/blessedux/inferwallet.git
cd inferwallet
bun install
cp .env.example .env
```

Fill `.env`:

- `OPENROUTER_API_KEY` — operator key (Treasury Absorb)
- `SKIP_CHAIN_VERIFY=0` once you want Horizon verification (use `1` for dry demos)
- Public SZX ids are already in `.env.example` / [`testnet-assets.json`](./testnet-assets.json)

Vault issuer/distributor/sink secrets separately (see [testnet-szx-runbook.md](./testnet-szx-runbook.md)). Never commit `.secrets/`.

## 2. SZX in Freighter

1. Freighter → **Testnet**
2. Add asset: code `SZX`, issuer from `docs/testnet-assets.json` → `asset.issuer`
3. Acquire SZX: buy on SDEX against classic USDC, or receive from the distributor

SDEX book: 15M SZX asks @ **$0.01** USDC are seeded. For a two-sided liquid book, fund the distributor with ~150k classic testnet USDC and run `bun run seed:sdex -- --with-bids`.

## 3. Run Infer Proxy + Companion

```bash
bun run dev:proxy       # http://127.0.0.1:8787
bun run dev:companion   # http://localhost:5173
```

## 4. Point Cursor at the Infer Proxy

Cursor Settings → Models / OpenAI compatible:

| Field | Value |
| --- | --- |
| Base URL | `http://127.0.0.1:8787/v1` |
| API key | any dummy string (e.g. `sk-inferwallet`) |
| Model | `inferwallet/balanced` (or `cheap` / `premium`) |

## 5. One settled completion

1. Open Companion → **Connect Freighter**
2. Pick a **Tier** (Cheap ~$0.01 / Balanced ~$0.03 / Premium ~$0.10) — UI shows live SZX from the **SDEX Quote**
3. In Cursor, send a chat that hits the proxy
4. Companion shows a **Pending Pay-to-Sink** → **Pay with Freighter**
5. After the payment confirms, the proxy streams the completion (OpenRouter if keyed, else stub)

Optional: **Fund Prepay** in Companion to debit subsequent requests without Freighter until the balance is exhausted.

## Tiers

| Tier | Fixed USD Feel | Env model id |
| --- | --- | --- |
| Cheap | $0.01 | `TIER_MODEL_CHEAP` |
| Balanced | $0.03 | `TIER_MODEL_BALANCED` |
| Premium | $0.10 | `TIER_MODEL_PREMIUM` |

## Operator references

- [Treasury Absorb (V1)](./treasury-absorb.md)
- [Spend guards](./operator-spend-guards.md)
- [Settlement vs provider failures](./settlement-policy.md)
- [V1.2 Pass-Through migration](./pass-through-v1.2.md) — **not implemented in V1**
