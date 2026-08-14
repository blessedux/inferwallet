# Testnet SZX issuance & SDEX seed

Classic asset **SZX** on Stellar **testnet**, Freighter-holdable, SDEX-quoted vs classic **USDC**.

## Decisions (HITL)

| Topic | Choice |
| --- | --- |
| Custody | Vault — operator owns issuer, distributor, and sink secrets |
| Supply | **100,000,000,000** SZX (100 billion) |
| Decimals | Classic **7** (stroop-equivalent: 1 SZX = 10⁷ base units) |
| Issuer lock | **Unlocked** on testnet (iteration) |
| Quote pair | **SZX / USDC** (classic testnet USDC) |
| First pool | **150,000 USDC** (operator-funded) + **15,000,000 SZX** asks @ **$0.01** |
| Sink | Fresh **G…** Pay-to-Sink destination |

### Why 100B?

Fixed USD Feel reference price is **~$0.01 / SZX** (Cheap tier ≈ 1 SZX). One hundred billion units is a round stroop-friendly supply with ~100 years of inference-spend headroom at that feel, under the classic int64 amount ceiling (~922B).

## Public identifiers

After `bun run scripts/issue-szx-testnet.ts`, see [`testnet-assets.json`](./testnet-assets.json) for issuer, distributor, sink, and explorer links. Secrets never live in git — only in `.secrets/szx-testnet.json` (gitignored) until you vault them.

Classic quote asset:

```text
USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
```

## Issue (one-time)

```bash
bun install
bun run scripts/issue-szx-testnet.ts
```

This will:

1. Generate issuer / distributor / sink keypairs → `.secrets/szx-testnet.json`
2. Friendbot-fund all three
3. Open distributor **and sink** SZX trustlines + pay **100B SZX** from issuer → distributor
4. Write public config → `docs/testnet-assets.json`

**Vault the secrets file immediately**, then delete the local copy.

## Freighter trustline + hold

1. Freighter → Testnet
2. Add asset: code `SZX`, issuer = `asset.issuer` from `testnet-assets.json`
3. Receive SZX from distributor (payment) or buy on SDEX once the book is live

```bash
# After Freighter has the SZX trustline:
npx tsx scripts/fund-freighter-szx.ts G... 1000
```

Without SZX balance, Pay-to-Sink / Fund Prepay fails with Horizon `op_underfunded` (shown as `400 Bad Request`).

## Seed the book (liquid from day one)

Target: mid **0.01 USDC per SZX**.

```bash
# Asks: 15M SZX for sale @ 0.01 USDC (uses distributor SZX inventory)
bun run scripts/seed-sdex-book.ts

# After you move ~150k classic testnet USDC onto the distributor:
bun run scripts/seed-sdex-book.ts --with-bids
```

`--with-bids` sells up to 150k USDC for SZX at the same price so the book is two-sided.

### Funding the 150k USDC

Testnet faucets mint small amounts. For the first liquid pool, **transfer classic testnet USDC** you control onto the **distributor** public key, then run `--with-bids`. (SAC/Soroban USDC from some faucets is not the SDEX classic asset — use issuer `GBBD47…FLA5`.)

## Env samples

Copy `.env.example` and fill public keys from `testnet-assets.json`:

```bash
SZX_CODE=SZX
SZX_ISSUER=<asset.issuer>
SZX_SINK=<sink>
HORIZON_URL=https://horizon-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
SKIP_CHAIN_VERIFY=0
```

## Verify

```bash
# Orderbook should show asks (and bids after USDC land)
curl -s "https://horizon-testnet.stellar.org/order_book?selling_asset_type=credit_alphanum4&selling_asset_code=SZX&selling_asset_issuer=<ISSUER>&buying_asset_type=credit_alphanum4&buying_asset_code=USDC&buying_asset_issuer=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" | head
```

Stellar Expert: link in `testnet-assets.json` → `stellarExpertAsset`.
