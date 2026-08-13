# Settlement vs provider failures

Policy (V1 Treasury Absorb):

1. Companion Pay-to-Sink (or Prepay debit) is verified **once** per request id.
2. Only after verification does the Infer Proxy call OpenRouter.
3. If OpenRouter fails, the proxy returns `502` with `retryable_without_payment: true`
   and keeps the request in `settled_retryable` state.
4. A retry with `X-Infer-Request-Id: <id>` reuses the same settlement — **no second charge**.
5. On successful completion (stream or JSON), the request id is consumed.

The operator OpenRouter key lives only in Infer Proxy env (`OPENROUTER_API_KEY`).
It must never be shipped in the Companion bundle.
