import type { APIRequestContext } from "@playwright/test";

type OdooAuthResponse = {
  jsonrpc: "2.0";
  id: number | null;
  result?: {
    uid?: number;
    session_id?: string;
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type OdooRpcResponse<T> = {
  jsonrpc: "2.0";
  id: number | null;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type OdooCredentials = {
  baseUrl: string;
  db: string;
  login: string;
  password: string;
};

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function parseSessionIdFromSetCookie(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = /(?:^|,\s*)session_id=([^;,\s]+)/.exec(headerValue);
  return match?.[1] ?? null;
}

export class OdooJsonRpcClient {
  private readonly request: APIRequestContext;
  private readonly credentials: OdooCredentials;
  private sessionId: string | null = null;
  private uid: number | null = null;

  constructor(request: APIRequestContext, credentials: OdooCredentials) {
    this.request = request;
    this.credentials = {
      ...credentials,
      baseUrl: normalizeBaseUrl(credentials.baseUrl),
    };
  }

  getUserId(): number {
    if (!this.uid) throw new Error("OdooJsonRpcClient is not authenticated.");
    return this.uid;
  }

  async authenticate(): Promise<{ uid: number; sessionId: string }> {
    const response = await this.request.post(`${this.credentials.baseUrl}/web/session/authenticate`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      data: {
        jsonrpc: "2.0",
        method: "call",
        params: {
          db: this.credentials.db,
          login: this.credentials.login,
          password: this.credentials.password,
        },
        id: 1,
      },
    });

    const payload = (await response.json()) as OdooAuthResponse;
    if (payload.error) {
      throw new Error(`RPC auth failed ${payload.error.code}: ${payload.error.message}`);
    }

    const uid = payload.result?.uid;
    if (!uid) {
      throw new Error("RPC auth failed: uid missing in response.");
    }

    const setCookie = response.headers()["set-cookie"] ?? null;
    const sid = payload.result?.session_id ?? parseSessionIdFromSetCookie(setCookie);

    if (!sid) {
      throw new Error("RPC auth failed: session_id missing in body/cookie.");
    }

    this.uid = uid;
    this.sessionId = sid;
    return { uid, sessionId: sid };
  }

  async callKw<T>(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this.sessionId) {
      await this.authenticate();
    }

    const response = await this.request.post(
      `${this.credentials.baseUrl}/web/dataset/call_kw/${model}/${method}`,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Cookie: `session_id=${this.sessionId}`,
        },
        data: {
          jsonrpc: "2.0",
          method: "call",
          params: { model, method, args, kwargs },
          id: Date.now(),
        },
      }
    );

    const payload = (await response.json()) as OdooRpcResponse<T>;
    if (payload.error) {
      throw new Error(`${model}.${method} failed ${payload.error.code}: ${payload.error.message}`);
    }

    if (payload.result === undefined) {
      throw new Error(`${model}.${method} returned undefined result.`);
    }

    return payload.result;
  }
}
