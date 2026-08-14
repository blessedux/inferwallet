import { useEffect, useState } from "react";
import {
  TIERS,
  TIER_STORAGE_KEY,
  type TierId,
  PROXY_URL,
} from "./config";
import {
  connectFreighter,
  fetchBalances,
  fetchPrepay,
  fetchQuote,
  freighterAvailable,
  fundPrepay,
  swapUsdcForSzx,
  type WalletBalances,
} from "./stellar";

function loadTier(): TierId {
  const raw = localStorage.getItem(TIER_STORAGE_KEY);
  if (raw === "cheap" || raw === "balanced" || raw === "premium") return raw;
  return "balanced";
}

type UsageEntry = {
  id: string;
  at: number;
  tier: string;
  model: string;
  usdFeel: number;
  szxAmount: string;
  promptTokens: number;
  completionTokens: number;
};

export function App() {
  const [tier, setTier] = useState<TierId>(loadTier);
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [szxAmount, setSzxAmount] = useState<string | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [hasFreighter, setHasFreighter] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [funding, setFunding] = useState(false);
  const [swapUsdc, setSwapUsdc] = useState("10.00");
  const [prepay, setPrepay] = useState<{
    remainingUsd: number;
    remainingSzx: string;
  } | null>(null);
  const [prepayUsd, setPrepayUsd] = useState("1.00");
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const [models, setModels] = useState<Record<TierId, string>>({
    cheap: "",
    balanced: "",
    premium: "",
  });

  useEffect(() => {
    localStorage.setItem(TIER_STORAGE_KEY, tier);
  }, [tier]);

  useEffect(() => {
    void freighterAvailable().then(setHasFreighter);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const q = await fetchQuote(tier);
        if (!cancelled) {
          setSzxAmount(q.szxAmount);
          setPrice(q.pricePerSzx);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setSzxAmount(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tier]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const bal = await fetchPrepay();
        const usageRes = await fetch(`${PROXY_URL}/v1/usage`);
        const modelsRes = await fetch(`${PROXY_URL}/v1/models`);
        if (alive) {
          setPrepay(bal);
          if (usageRes.ok) {
            const data = (await usageRes.json()) as { usage: UsageEntry[] };
            setUsage(data.usage ?? []);
          }
          if (modelsRes.ok) {
            const data = (await modelsRes.json()) as {
              data: Array<{ id: string; root: string }>;
            };
            const mapped: Record<string, string> = {};
            for (const m of data.data) {
              const id = m.id.replace("inferwallet/", "");
              if (id === "cheap" || id === "balanced" || id === "premium") {
                mapped[id] = m.root;
              }
            }
            setModels(mapped as Record<TierId, string>);
          }
        }
      } catch {
        /* proxy may be down */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!address) return;
    let alive = true;
    const refresh = async () => {
      try {
        const bal = await fetchBalances(address);
        if (alive) setBalances(bal);
      } catch {
        /* ignore */
      }
    };
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [address]);

  async function onConnect() {
    setConnecting(true);
    setError("");
    try {
      const result = await connectFreighter();
      setAddress(result.address);
      setNetwork(result.network);
      setStatus(`Connected on ${result.network}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }

  async function onSwap() {
    if (!address) {
      setError("Connect Freighter first");
      return;
    }
    const usdc = Number(swapUsdc);
    if (!(usdc > 0)) {
      setError("Enter a positive USDC amount");
      return;
    }
    setSwapping(true);
    setError("");
    setStatus("Swapping USDC → SZX…");
    try {
      const { hash, szxAmount } = await swapUsdcForSzx(address, usdc);
      setStatus(`Swapped ${usdc} USDC → ${szxAmount} SZX · ${hash.slice(0, 8)}…`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
    } finally {
      setSwapping(false);
    }
  }

  async function onFundPrepay() {
    if (!address) {
      setError("Connect Freighter first");
      return;
    }
    const usd = Number(prepayUsd);
    if (!(usd > 0)) {
      setError("Enter a positive USD amount");
      return;
    }
    setFunding(true);
    setError("");
    setStatus("Loading credits…");
    try {
      const { hash, szxAmount } = await fundPrepay(address, usd);
      setStatus(`Loaded ${szxAmount} SZX ($${usd}) · ${hash.slice(0, 8)}…`);
      const bal = await fetchPrepay();
      setPrepay(bal);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
    } finally {
      setFunding(false);
    }
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard");
    setTimeout(() => setStatus(""), 2000);
  }

  const feel = TIERS[tier];
  const baseUrl = `${PROXY_URL}/v1`;

  // Per-model token totals
  const tokensByModel: Record<string, { prompt: number; completion: number }> = {};
  for (const entry of usage) {
    if (!tokensByModel[entry.model]) {
      tokensByModel[entry.model] = { prompt: 0, completion: 0 };
    }
    const totals = tokensByModel[entry.model];
    if (totals) {
      totals.prompt += entry.promptTokens;
      totals.completion += entry.completionTokens;
    }
  }

  return (
    <main className="shell">
      <header className="brand">
        <h1>InferWallet</h1>
        <p className="lede">Run Cursor with SZX. No login. No card.</p>
      </header>

      <section className="block">
        <h2>Wallet</h2>
        {hasFreighter === false && (
          <p className="warn">
            Freighter not detected. Install Freighter extension and unlock on Testnet.
          </p>
        )}
        {address ? (
          <>
            <p className="mono">
              {address.slice(0, 6)}…{address.slice(-6)}
              {network ? ` · ${network}` : ""}
            </p>
            {balances && (
              <div className="balances">
                <span>USDC {balances.usdc}</span>
                <span>SZX {balances.szx}</span>
              </div>
            )}
          </>
        ) : (
          <button type="button" onClick={onConnect} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect Freighter"}
          </button>
        )}
      </section>

      <section className="block">
        <h2>Swap</h2>
        <p className="meta">
          Trust SZX + USDC in Freighter first. Swaps USDC → SZX on the testnet SDEX.
        </p>
        <div className="swap-row">
          <label>
            USDC in
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={swapUsdc}
              onChange={(e) => setSwapUsdc(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!address || swapping}
            onClick={() => void onSwap()}
          >
            {swapping ? "Swapping…" : "Swap"}
          </button>
        </div>
      </section>

      <section className="block">
        <h2>Cursor</h2>
        <p className="meta">
          Set OpenAI Base URL in Cursor Models settings. Use any dummy API key.
        </p>
        <div className="url-box" onClick={() => copyToClipboard(baseUrl)}>
          <code>{baseUrl}</code>
          <span className="copy-hint">click to copy</span>
        </div>
      </section>

      <section className="block">
        <h2>Model</h2>
        <div className="tiers" role="radiogroup" aria-label="Model tier">
          {(Object.keys(TIERS) as TierId[]).map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={tier === id}
              className={tier === id ? "tier active" : "tier"}
              onClick={() => setTier(id)}
            >
              <span className="tier-label">{TIERS[id].label}</span>
              <span className="tier-feel">${TIERS[id].usdFeel.toFixed(2)}</span>
              <span className="tier-desc">{TIERS[id].description}</span>
              {models[id] && <span className="tier-model">{models[id]}</span>}
            </button>
          ))}
        </div>
        <p className="quote">
          {szxAmount && price
            ? `${szxAmount} SZX at ${price} USDC/SZX (SDEX)`
            : "Quoting…"}
        </p>
      </section>

      <section className="block">
        <h2>Credits</h2>
        <p className="meta">Load credits to meter requests without Freighter popups.</p>
        <p className="quote">
          Balance:{" "}
          <strong>
            {prepay
              ? `$${prepay.remainingUsd.toFixed(2)} · ${prepay.remainingSzx} SZX`
              : "$0.00"}
          </strong>
        </p>
        <div className="prepay-row">
          <label>
            USD
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={prepayUsd}
              onChange={(e) => setPrepayUsd(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!address || funding}
            onClick={() => void onFundPrepay()}
          >
            {funding ? "Loading…" : "Load Credits"}
          </button>
        </div>
      </section>

      <section className="block">
        <h2>Usage</h2>
        {usage.length === 0 ? (
          <p className="empty">No usage yet. Run Cursor against the proxy.</p>
        ) : (
          <>
            <div className="usage-list">
              {usage.slice().reverse().slice(0, 10).map((entry) => (
                <div key={entry.id} className="usage-entry">
                  <span className="usage-time">
                    {new Date(entry.at).toLocaleTimeString()}
                  </span>
                  <span className="usage-model">{entry.model}</span>
                  <span className="usage-feel">${entry.usdFeel.toFixed(2)}</span>
                  <span className="usage-szx">{entry.szxAmount} SZX</span>
                </div>
              ))}
            </div>
            {Object.keys(tokensByModel).length > 0 && (
              <div className="token-totals">
                {Object.entries(tokensByModel).map(([model, tokens]) => (
                  <div key={model} className="token-row">
                    <span className="token-model">{model}</span>
                    <span className="token-count">
                      {tokens.prompt}p / {tokens.completion}c
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {(status || error) && (
        <div className="feedback">
          <p className={error ? "error" : "status"}>{error || status}</p>
        </div>
      )}

      <footer className="footer">
        <a href="https://github.com/yourusername/inference/tree/main/docs">Docs</a>
        <a href="https://github.com/yourusername/inference/tree/main/docs">API</a>
      </footer>
    </main>
  );
}
