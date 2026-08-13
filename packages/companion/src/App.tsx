import { placeholder } from "@inferwallet/sdk";

/**
 * Companion — Freighter connect, tiers, Pay-to-Sink approval (placeholder).
 */
export function App() {
  return (
    <main className="shell">
      <h1>InferWallet Companion</h1>
      <p>
        Connect Freighter, pick a Tier, and approve Pay-to-Sink settlement for the
        Infer Proxy. Scaffold only — wiring lands in later tickets.
      </p>
      <p className="meta">SDK: {placeholder()}</p>
    </main>
  );
}
