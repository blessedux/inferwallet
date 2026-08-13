# Treasury Absorb (V1)

**Treasury Absorb** is the V1 economic model for InferWallet.

## What it means

1. The developer pays **SZX** via **Pay-to-Sink** (or **Prepay**) from Freighter.
2. The Infer Proxy verifies settlement on Stellar testnet.
3. The **operator’s OpenRouter key** pays the model provider.
4. Received SZX sits with the sink/treasury — the operator absorbs provider cost in fiat/crypto of their choosing.

This is **not** Pass-Through. The user’s SZX is not automatically converted to fund OpenRouter in V1.

## Why V1 starts here

- Fastest path to a demoable Freighter → Cursor loop
- Keeps Companion UX stable when economics change later
- Operator retains control of provider keys and spend guards

## What the user sees

- Hold **SZX**, pick a **Tier** (Fixed USD Feel), approve payment
- No product account, no user OpenRouter key, no credit card in the Companion

## Related

- Domain glossary: [`CONTEXT.md`](../CONTEXT.md)
- Next economics step: [`pass-through-v1.2.md`](./pass-through-v1.2.md) (not implemented in V1)
