import { useEffect, useState, useTransition } from "react";
import {
  TIERS,
  TIER_STORAGE_KEY,
  type TierId,
  PROXY_URL,
} from "./config";
import {
  connectFreighter,
  fetchPending,
  fetchPrepay,
  fetchQuote,
  freighterAvailable,
  fundPrepay,
  payPending,
  type PendingFromProxy,
} from "./stellar";

function loadTier(): TierId {
  const raw = localStorage.getItem(TIER_STORAGE_KEY);
  if (raw === "cheap" || raw === "balanced" || raw === "premium") return raw;
  return "balanced";
}

export function App() {
  const [tier, setTier] = useState<TierId>(loadTier);
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [szxAmount, setSzxAmount] = useState<string | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingFromProxy[]>([]);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [hasFreighter, setHasFreighter] = useState<boolean | null>(null);
  const [pendingConnect, startConnect] = useTransition();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [prepay, setPrepay] = useState<{
    remainingUsd: number;
    remainingSzx: string;
  } | null>(null);
  const [prepayUsd, setPrepayUsd] = useState("1.00");
  const [funding, setFunding] = useState(false);

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
        const list = await fetchPending();
        const bal = await fetchPrepay();
        if (alive) {
          setPending(list);
          setPrepay(bal);
        }
      } catch {
        /* proxy may be down */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  function onConnect() {
    setError("");
    startConnect(async () => {
      try {
        const result = await connectFreighter();
        setAddress(result.address);
        setNetwork(result.network);
        setStatus(`Connected on ${result.network}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  async function onFundPrepay() {
    if (!address) {
      setError("Connect Freighter first");
      return;
    }
    const usd = Number(prepayUsd);
    if (!(usd > 0)) {
      setError("Enter a positive Prepay USD amount");
      return;
    }
    setFunding(true);
    setError("");
    setStatus("Funding Prepay — await Freighter…");
    try {
      const { hash, szxAmount } = await fundPrepay(address, usd);
      setStatus(`Prepay funded ${szxAmount} SZX ($${usd}) — ${hash.slice(0, 8)}…`);
      setPrepay(await fetchPrepay());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
    } finally {
      setFunding(false);
    }
  }

  async function onPay(item: PendingFromProxy) {
    if (!address) {
      setError("Connect Freighter first");
      return;
    }
    setPayingId(item.id);
    setError("");
    setStatus("Awaiting Freighter signature…");
    try {
      const { hash, szxAmount: paid } = await payPending(item, address);
      setStatus(`Settled ${paid} SZX — tx ${hash.slice(0, 8)}…`);
      setPending((prev) => prev.filter((p) => p.id !== item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
    } finally {
      setPayingId(null);
    }
  }

  const feel = TIERS[tier];

  return (
    <main className="shell">
      <header className="brand">
        <p className="eyebrow">InferWallet</p>
        <h1>Companion</h1>
        <p className="lede">
          Connect Freighter on testnet, pick a Tier, and approve Pay-to-Sink when
          the Infer Proxy needs settlement.
        </p>
      </header>

      <section className="block">
        <h2>Wallet</h2>
        {hasFreighter === false && (
          <p className="warn">
            Freighter extension not detected. Install Freighter and unlock it on
            Testnet.
          </p>
        )}
        {address ? (
          <p className="mono">
            {address.slice(0, 4)}…{address.slice(-4)}
            {network ? ` · ${network}` : ""}
          </p>
        ) : (
          <button type="button" onClick={onConnect} disabled={pendingConnect}>
            {pendingConnect ? "Connecting…" : "Connect Freighter"}
          </button>
        )}
      </section>

      <section className="block">
        <h2>Tier</h2>
        <div className="tiers" role="radiogroup" aria-label="Inference tier">
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
            </button>
          ))}
        </div>
        <p className="quote">
          Fixed USD Feel <strong>${feel.usdFeel.toFixed(2)}</strong>
          {szxAmount && price ? (
            <>
              {" "}
              → <strong>{szxAmount} SZX</strong> at {price} USDC/SZX (SDEX)
            </>
          ) : (
            " · quoting…"
          )}
        </p>
      </section>

      <section className="block">
        <h2>Prepay</h2>
        <p className="meta">
          Pay a larger SZX amount once; Cursor requests debit the balance without
          Freighter until it runs out.
        </p>
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
            {funding ? "Funding…" : "Fund Prepay"}
          </button>
        </div>
      </section>

      <section className="block">
        <h2>Pending Pay-to-Sink</h2>
        <p className="meta">Polling {PROXY_URL}/v1/pending</p>
        {pending.length === 0 ? (
          <p className="empty">No pending requests. Point Cursor at the Infer Proxy.</p>
        ) : (
          <ul className="pending-list">
            {pending.map((item) => (
              <li key={item.id}>
                <div>
                  <span className="mono">{item.id.slice(0, 8)}…</span>
                  <span>
                    {" "}
                    {item.tier} · ${item.usdFeel.toFixed(2)}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!address || payingId === item.id}
                  onClick={() => void onPay(item)}
                >
                  {payingId === item.id ? "Signing…" : "Pay with Freighter"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(status || error) && (
        <p className={error ? "error" : "status"}>{error || status}</p>
      )}
    </main>
  );
}
