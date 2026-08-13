# SZX / InferWallet

Permissionless AI inference spend on Stellar: hold the classic asset **SZX**, pay it from a Freighter-connected companion, and receive model completions in Cursor through a local proxy — no product accounts, API keys, or cards for the developer.

## Language

**SZX**:
The classic Stellar asset (`SZX:ISSUER`) used as the unit of spend for inference. Tradable on SDEX; held in a normal Stellar wallet.
_Avoid_: INFER, inference token (as a distinct asset name), custom Soroban token

**InferWallet**:
The end-to-end product experience: local proxy + companion + thin SDK that turns SZX holdings into Cursor completions.
_Avoid_: router network, diamond proxy product

**Infer Proxy**:
The local OpenAI-compatible Node process Cursor points at; it gates OpenRouter calls on verified SZX settlement.
_Avoid_: hosted gateway (in V1), OpenRouter account (user-facing)

**Companion**:
The localhost web UI where Freighter connects, the user picks a tier, and payments or prepays are approved.
_Avoid_: dashboard, dapp (as the primary name), wallet app

**Treasury Absorb**:
V1 economic model: the user pays SZX to a sink; the operator’s OpenRouter key pays the model provider.
_Avoid_: pass-through (V1.2), protocol pay, user USDC settle

**Pass-Through**:
Post-V1 (V1.2) economic model: SZX received is converted (e.g. via SDEX) to fund provider spend so the operator is hedged.
_Avoid_: treasury absorb (once Pass-Through is live)

**Pay-to-Sink**:
A classic Stellar payment of SZX to a fixed treasury/sink account, bound to a request, verified before inference runs.
_Avoid_: burn (as the V1 mechanism), true burn, clawback

**Request Binding**:
The on-chain link (memo or claim hash) that ties a Pay-to-Sink payment to one inference request or prepay debit.
_Avoid_: unsigned promise, off-chain-only receipt

**Prepay**:
An optional Companion flow where the user pays a larger SZX amount once; the Infer Proxy meters that balance across requests until exhausted.
_Avoid_: subscription, escrow contract (in V1)

**Tier**:
A named spend band (Cheap / Balanced / Premium) with a fixed USD feel and a configured OpenRouter model id.
_Avoid_: plan, subscription tier

**Fixed USD Feel**:
The user-visible dollar amount for a Tier; the SZX quantity is derived from the live SDEX quote so the dollar feel stays stable as the token price moves.
_Avoid_: fixed SZX amount per request

**SDEX Quote**:
The live price of SZX used to compute how many units equal a Tier’s Fixed USD Feel, taken from the Stellar DEX (order book / path).
_Avoid_: external oracle (in V1), manual admin rate (as the primary source)
