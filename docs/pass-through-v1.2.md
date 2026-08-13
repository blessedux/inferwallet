# V1.2 Pass-Through migration (not implemented in V1)

**Status:** Documentation only. V1 ships **Treasury Absorb**. Pass-Through is the planned V1.2 economic change.

## What stays the same (UX)

- Freighter connect in the **Companion**
- **Tier** + **Fixed USD Feel** + **SDEX Quote** → SZX amount
- Classic **Pay-to-Sink** with **Request Binding**
- Optional **Prepay** metering
- Cursor → local **Infer Proxy** OpenAI-compatible API

Developers should not need a new payment ritual when Pass-Through lands.

## What changes (operator economics)

| | V1 Treasury Absorb | V1.2 Pass-Through |
| --- | --- | --- |
| Who pays OpenRouter | Operator key / treasury | Hedged from received SZX (e.g. SDEX → USDC → provider) |
| Sink role | Collects SZX | Collects SZX that is converted toward provider spend |
| Operator risk | Naked absorb of inference cost | Reduced naked exposure; inventory / FX risk instead |

## Migration sketch (future)

1. Keep Pay-to-Sink + Request Binding unchanged.
2. Add an operator worker that converts sink SZX toward provider funding (SDEX or OTC).
3. Meter OpenRouter spend against converted proceeds; pause forwarding if hedge buffer is low (alongside existing spend guards).
4. Document any new env vars; Companion UI stays payment-first.

Until that lands, treat this file as the contract: **UX stable, economics swap behind the proxy.**
