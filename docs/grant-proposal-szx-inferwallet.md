# SZX / InferWallet — Grant proposal description

**Working title:** SZX InferWallet — permissionless AI spend on Stellar  
**Network (MVP):** Stellar testnet  
**Suggested SCF category:** Developer Tooling  
**Asset:** Classic Stellar asset `SZX` (SDEX-tradable)

## One-liner

Hold **SZX** in Freighter, point Cursor at a local proxy, and pay for AI completions with a Stellar payment — no product signup, no API keys, no credit card.

## What it does

**SZX InferWallet** turns a tradable Stellar asset into the unit of account for IDE inference:

1. A developer buys **SZX** on the **SDEX** (e.g. with test USDC/XLM).
2. They run a small local **Infer Proxy** and a **Companion** page in the browser.
3. Cursor is configured to talk to `http://localhost:…` with a dummy API key.
4. On each request (or after an optional **Prepay**), Freighter signs a classic **Pay-to-Sink** of SZX.
5. Once the payment is confirmed on-chain, the proxy calls the model provider and **streams** the completion back into Cursor.

The user-facing price is a **Fixed USD Feel** (Cheap ~$0.01 / Balanced ~$0.03 / Premium ~$0.10). Behind the scenes the proxy sizes the SZX amount from a live **SDEX Quote**, so the dollar experience stays stable as the token price moves.

## How it works (architecture)

```text
Cursor  --OpenAI-compatible-->  Infer Proxy (local Node)
                                      |
                                      | pending settlement
                                      v
                               Companion (localhost)
                                      |
                                      | Freighter sign
                                      v
                               Stellar testnet
                               Pay-to-Sink (SZX)
                                      |
                                      | Horizon verify
                                      v
                               Infer Proxy
                                      |
                                      | operator OpenRouter key
                                      v
                               OpenRouter stream --> Cursor
```

| Piece | Role |
| --- | --- |
| **SZX** | Classic asset — Freighter + SDEX native; not a custom Soroban token in MVP |
| **Companion** | Freighter connect, tier pick, approve payment / Prepay |
| **Infer Proxy** | Cursor endpoint; gates provider calls on verified settlement; spend guards |
| **Thin SDK** | SDEX quote, build Pay-to-Sink + request binding, verify on Horizon |
| **Treasury Absorb (V1)** | Operator’s OpenRouter key pays the model; user’s SZX goes to a sink |
| **Pass-Through (V1.2)** | Documented next step: hedge by converting received SZX toward provider funding |

**Explicitly out of MVP:** diamond proxies, staked router registries, reputation networks, mainnet, true burn as the payment op, x402/MPP as the primary rail.

## Why Stellar

- **SDEX → wallet → spend** is one continuous loop; InferWallet is the missing “spend in the IDE” step.
- Classic assets keep **Freighter** and **order-book** UX; settlement is a normal payment (sub-second, negligible fees on Stellar).
- Adjacent ecosystem work (x402/MPP, pay-per-call APIs) mostly settles in **USDC**. SZX is different: a **dedicated inference asset** you can market-make and hold specifically for AI spend.

## Differentiation (SCF positioning)

Closest public prior art includes pay-per-call / agentic payment pitches (e.g. ApiCharge-style ML APIs, ROZO Pay for AI via MPP) that monetize endpoints in stablecoins. InferWallet instead targets **developers inside Cursor**: the buyer experience is “I already hold SZX,” not “I integrated an HTTP 402 client.”

| Crowded lane | Our wedge |
| --- | --- |
| USDC micropayments for APIs | **SZX** as the spend asset + SDEX discovery |
| Hosted agent payment protocols | **Local** proxy + Freighter Companion (sovereign, demoable) |
| Generic wallets | **IDE-native** OpenAI-compatible drop-in |

## Milestone plan (aligned with product scopes)

**V1 — Testnet InferWallet loop**

- Issue SZX, seed SDEX liquidity, Freighter Companion, Infer Proxy, Fixed USD Feel, OpenRouter streaming under Treasury Absorb, Prepay, daily ceiling + kill switch, docs including V1.2 migration.

**V1.2 — Pass-Through economics**

- Keep the same payment UX; change operator economics so received SZX funds provider spend (hedged), reducing naked Treasury Absorb risk.

## Success criteria

- A stranger with Freighter + Cursor can complete **one settled, streamed completion** on testnet from a README in under an hour.
- Zero developer accounts beyond Stellar wallet + local process.
- Clear written path from Treasury Absorb → Pass-Through without rewriting the Companion flow.

## Ask (fill per round)

_Funding amount, award track (Build / etc.), and timeline to be filled for the specific SCF round. Technical scope above is V1 testnet delivery of InferWallet as specified in the InferWallet MVP PRD._

## Links

- Domain glossary: `CONTEXT.md`
- Product backlog: Exponential product **SZX** (`szx`) — feature **InferWallet MVP**
