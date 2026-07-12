import { test as setup } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { getAutomationEnv } from "../utils/env";
import { applySessionCookie, rpcAuthenticate } from "../utils/rpcAuth";

const authFile = path.join(__dirname, "..", ".auth", "user.json");

setup("authenticate via JSON-RPC and persist storageState", async ({ request, context, page }) => {
  const env = getAutomationEnv();

  const sessionId = await rpcAuthenticate(request, env.ODOO_URL, env.ODOO_DB, env.ODOO_USER, env.ODOO_PASSWORD);
  await applySessionCookie(context, env.ODOO_URL, sessionId);

  mkdirSync(path.dirname(authFile), { recursive: true });
  await context.storageState({ path: authFile });
});
