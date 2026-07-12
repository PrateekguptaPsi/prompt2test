import { APIRequestContext, BrowserContext } from "@playwright/test";

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

function parseSessionIdFromSetCookie(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = /(?:^|,\s*)session_id=([^;,\s]+)/.exec(headerValue);
  return match?.[1] ?? null;
}

export async function rpcAuthenticate(
  request: APIRequestContext,
  baseUrl: string,
  db: string,
  login: string,
  password: string
): Promise<string> {
  const response = await request.post(`${baseUrl}/web/session/authenticate`, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    data: {
      jsonrpc: "2.0",
      method: "call",
      params: { db, login, password },
      id: 1,
    },
  });

  const payload = (await response.json()) as OdooAuthResponse;
  if (payload.error) {
    throw new Error(`RPC auth failed ${payload.error.code}: ${payload.error.message}`);
  }

  if (!payload.result?.uid) {
    throw new Error("RPC auth failed: uid missing in response.");
  }

  const setCookie = response.headers()["set-cookie"] ?? null;
  const sid = payload.result?.session_id ?? parseSessionIdFromSetCookie(setCookie);

  if (!sid) {
    throw new Error("RPC auth failed: session_id missing in body/cookie.");
  }

  return sid;
}

export async function applySessionCookie(context: BrowserContext, baseUrl: string, sessionId: string): Promise<void> {
  const host = new URL(baseUrl).hostname;
  await context.addCookies([
    {
      name: "session_id",
      value: sessionId,
      domain: host,
      path: "/",
      httpOnly: true,
      secure: baseUrl.startsWith("https"),
      sameSite: "Lax",
    },
  ]);
}

/**
 * Re-authenticates the page's browser context via JSON-RPC and injects a
 * fresh session cookie. Used to self-heal when the shared server expires the
 * stored session mid-run (long suites died with "redirected to login" before).
 */
export async function reauthenticatePage(
  page: import("@playwright/test").Page,
  env: { ODOO_URL: string; ODOO_DB: string; ODOO_USER: string; ODOO_PASSWORD: string }
): Promise<void> {
  const sessionId = await rpcAuthenticate(page.request, env.ODOO_URL, env.ODOO_DB, env.ODOO_USER, env.ODOO_PASSWORD);
  await applySessionCookie(page.context(), env.ODOO_URL, sessionId);
}
