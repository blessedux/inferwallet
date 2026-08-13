/** OpenAI-compatible request/response shapes (minimal). */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionRequest {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: "stop" | "length" | null;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
}

export type TierId = "cheap" | "balanced" | "premium";

export type PendingRequestStatus =
  | "awaiting_payment"
  | "settled"
  | "expired"
  /** Settled but provider failed — retry without new payment. */
  | "settled_retryable";

export interface PendingRequest {
  id: string;
  createdAt: number;
  tier: TierId;
  usdFeel: number;
  szxAmount: string | null;
  status: PendingRequestStatus;
  /** Original chat payload held until settlement. */
  payload: ChatCompletionRequest;
  settlementTxHash?: string;
}

export interface SettlementBody {
  requestId: string;
  transactionHash: string;
  /** Optional: Companion-reported SZX amount paid. */
  szxAmount?: string;
}

export interface CompletionBackend {
  complete(req: ChatCompletionRequest, ctx: { requestId: string; model: string }): Promise<ChatCompletionResponse>;
}
