export interface MoonPayErrorPayload {
  error: string;
  tool?: string;
  [key: string]: unknown;
}

export class MoonPayApiError extends Error {
  readonly tool: string;
  readonly status: number;
  readonly payload: MoonPayErrorPayload;

  constructor(tool: string, status: number, payload: MoonPayErrorPayload) {
    super(payload.error || `MoonPay ${tool} failed (${status})`);
    this.name = "MoonPayApiError";
    this.tool = tool;
    this.status = status;
    this.payload = payload;
  }
}

export class MoonPayNoAccountError extends MoonPayApiError {
  constructor(tool: string, status: number, payload: MoonPayErrorPayload) {
    super(tool, status, payload);
    this.name = "MoonPayNoAccountError";
  }
}

const NO_ACCOUNT_RX = /no\s+mooncard\s+account\s+found/i;

export function classifyError(
  tool: string,
  status: number,
  payload: MoonPayErrorPayload,
): MoonPayApiError {
  if (NO_ACCOUNT_RX.test(payload.error || "")) {
    return new MoonPayNoAccountError(tool, status, payload);
  }
  return new MoonPayApiError(tool, status, payload);
}
