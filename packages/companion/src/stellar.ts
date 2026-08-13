import {
  isConnected,
  requestAccess,
  getAddress,
  getNetwork,
  signTransaction,
  setAllowed,
} from "@stellar/freighter-api";
import {
  Horizon,
  TransactionBuilder,
  Networks,
} from "@stellar/stellar-sdk";
import {
  buildPayToSink,
  quoteSzxForUsdFeel,
  type SzxConfig,
} from "@inferwallet/sdk";
import {
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  PROXY_URL,
  SZX_CONFIG,
  type TierId,
  TIERS,
} from "./config";

export type PendingFromProxy = {
  id: string;
  tier: TierId;
  usdFeel: number;
  status: string;
  szxAmount: string | null;
};

export async function freighterAvailable(): Promise<boolean> {
  try {
    const { isConnected: connected } = await isConnected();
    return Boolean(connected);
  } catch {
    return false;
  }
}

export async function connectFreighter(): Promise<{
  address: string;
  network: string;
}> {
  await setAllowed();
  const access = await requestAccess();
  if (access.error) throw new Error(access.error);
  const addr = await getAddress();
  if (addr.error || !addr.address) {
    throw new Error(addr.error ?? "No Freighter address");
  }
  const net = await getNetwork();
  return {
    address: addr.address,
    network: net.network ?? "TESTNET",
  };
}

export async function fetchQuote(tier: TierId) {
  const usdFeel = TIERS[tier].usdFeel;
  return quoteSzxForUsdFeel(SZX_CONFIG as SzxConfig, usdFeel);
}

export async function fetchPending(): Promise<PendingFromProxy[]> {
  const res = await fetch(`${PROXY_URL}/v1/pending`);
  if (!res.ok) throw new Error(`pending ${res.status}`);
  const body = (await res.json()) as { pending: PendingFromProxy[] };
  return body.pending ?? [];
}

export async function fetchPrepay(): Promise<{
  remainingUsd: number;
  remainingSzx: string;
} | null> {
  const res = await fetch(`${PROXY_URL}/v1/prepay`);
  if (!res.ok) throw new Error(`prepay ${res.status}`);
  const body = (await res.json()) as {
    prepay: { remainingUsd: number; remainingSzx: string } | null;
  };
  return body.prepay;
}

/** Fund session Prepay with a larger Pay-to-Sink (USD feel units). */
export async function fundPrepay(
  publicKey: string,
  usd: number,
): Promise<{ hash: string; szxAmount: string }> {
  const quote = await quoteSzxForUsdFeel(SZX_CONFIG as SzxConfig, usd);
  const requestId = `prepay:${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const server = new Horizon.Server(HORIZON_URL);
  const account = await server.loadAccount(publicKey);
  const built = buildPayToSink(SZX_CONFIG as SzxConfig, {
    sourcePublicKey: publicKey,
    sequence: account.sequenceNumber(),
    szxAmount: quote.szxAmount,
    requestId,
  });
  const signed = await signTransaction(built.xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: publicKey,
  });
  if (signed.error || !signed.signedTxXdr) {
    throw new Error(signed.error ?? "Freighter did not return signed XDR");
  }
  const tx = TransactionBuilder.fromXDR(
    signed.signedTxXdr,
    NETWORK_PASSPHRASE || Networks.TESTNET,
  );
  const result = await server.submitTransaction(tx);
  const settle = await fetch(`${PROXY_URL}/v1/prepay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transactionHash: result.hash,
      usd,
      szxAmount: quote.szxAmount,
      publicKey,
      requestId,
    }),
  });
  if (!settle.ok) {
    throw new Error(`prepay fund failed: ${settle.status} ${await settle.text()}`);
  }
  return { hash: result.hash, szxAmount: quote.szxAmount };
}

export async function payPending(
  pending: PendingFromProxy,
  publicKey: string,
): Promise<{ hash: string; szxAmount: string }> {
  const tier = pending.tier in TIERS ? pending.tier : "balanced";
  const quote = await fetchQuote(tier);
  const server = new Horizon.Server(HORIZON_URL);
  const account = await server.loadAccount(publicKey);

  const built = buildPayToSink(SZX_CONFIG as SzxConfig, {
    sourcePublicKey: publicKey,
    sequence: account.sequenceNumber(),
    szxAmount: quote.szxAmount,
    requestId: pending.id,
  });

  const signed = await signTransaction(built.xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: publicKey,
  });
  if (signed.error || !signed.signedTxXdr) {
    throw new Error(signed.error ?? "Freighter did not return signed XDR");
  }

  const tx = TransactionBuilder.fromXDR(
    signed.signedTxXdr,
    NETWORK_PASSPHRASE || Networks.TESTNET,
  );
  const result = await server.submitTransaction(tx);
  const hash = result.hash;

  const settle = await fetch(`${PROXY_URL}/v1/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: pending.id,
      transactionHash: hash,
      szxAmount: quote.szxAmount,
    }),
  });
  if (!settle.ok) {
    const err = await settle.text();
    throw new Error(`settle failed: ${settle.status} ${err}`);
  }

  return { hash, szxAmount: quote.szxAmount };
}
