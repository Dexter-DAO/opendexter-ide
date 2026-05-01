export interface DextercardErrorPayload {
  error: string;
  tool?: string;
  [key: string]: unknown;
}

export class DextercardApiError extends Error {
  readonly tool: string;
  readonly status: number;
  readonly payload: DextercardErrorPayload;

  constructor(tool: string, status: number, payload: DextercardErrorPayload) {
    super(payload.error || `Dextercard ${tool} failed (${status})`);
    this.name = "DextercardApiError";
    this.tool = tool;
    this.status = status;
    this.payload = payload;
  }
}

export class DextercardNoAccountError extends DextercardApiError {
  constructor(tool: string, status: number, payload: DextercardErrorPayload) {
    super(tool, status, payload);
    this.name = "DextercardNoAccountError";
  }
}

// Matches "no MoonCard account found", "no agents card account found", etc.
const NO_ACCOUNT_RX = /no\s+\w*\s*card\s+account\s+found/i;

export function classifyError(
  tool: string,
  status: number,
  payload: DextercardErrorPayload,
): DextercardApiError {
  if (NO_ACCOUNT_RX.test(payload.error || "")) {
    return new DextercardNoAccountError(tool, status, payload);
  }
  return new DextercardApiError(tool, status, payload);
}
