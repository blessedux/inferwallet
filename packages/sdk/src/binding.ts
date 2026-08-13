/**
 * Request Binding — on-chain link tying a Pay-to-Sink payment to one inference request.
 * V1 uses a classic memo (text), capped at 28 bytes.
 */

const PREFIX = "iw:";

/** Build the memo text for a request id (truncated to Stellar memo text limit). */
export function requestBinding(requestId: string): string {
  const raw = `${PREFIX}${requestId}`;
  // MemoText max 28 bytes
  const encoder = new TextEncoder();
  const bytes = encoder.encode(raw);
  if (bytes.length <= 28) return raw;
  return new TextDecoder().decode(bytes.slice(0, 28));
}

export function bindingMatches(memo: string | null | undefined, requestId: string): boolean {
  if (!memo) return false;
  return memo === requestBinding(requestId);
}
