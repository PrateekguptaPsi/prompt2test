import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

type EnvMap = Record<string, string>;

type FieldInfo = {
  name: string;
  label: string;
  required: boolean;
};

type ModuleMapEntry = {
  module: string;
  menuPath: string | null;
  actionUrl: string;
  actionId: number | null;
  actionRef: string | null;
  columns: string[];
  formFields: FieldInfo[];
  error?: string;
};

// Navbar on this instance (verified by probe): top-level dropdown buttons
// "Patients", "Doctors", "Management" hold the module entries; dropdown items
// only exist in the DOM after the button is clicked.
const MODULES = [
  "Patients",
  "Doctors",
  "Prescriptions",
  "Lab Reports",
  "IPD Details",
  "Appointments",
  "Billing",
  "Ward Management",
  "Bed Management",
];

// Menu labels differ between top nav, Management dropdown, and dashboard cards.
const MODULE_ALIASES: Record<string, string[]> = {
  Patients: ["Patients", "Patient"],
  Doctors: ["Doctors", "Doctor"],
  Prescriptions: ["Prescriptions", "Prescription"],
  "Lab Reports": ["Lab Reports", "Lab Report"],
  "IPD Details": ["IPD Details", "IPD Management", "IPD Registrations", "IPD Registration", "IPD"],
  Appointments: ["Appointments", "Appointment"],
  Billing: ["Billings", "Billing", "Hospital Billing"],
  "Ward Management": ["Ward Management", "Wards", "Ward"],
  "Bed Management": ["Bed Management", "Beds", "Bed"],
};

function parseEnv(raw: string): EnvMap {
  const env: EnvMap = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

function readEnvFile(path = ".env"): EnvMap {
  return parseEnv(readFileSync(path, "utf8"));
}

function requireEnv(env: EnvMap, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractAction(url: string): { actionId: number | null; actionRef: string | null } {
  // Odoo 17+ nests actions (/odoo/action-372/action-374) — the LAST one is the
  // current view's action; the first is the dashboard it was opened from.
  const matches = Array.from(url.matchAll(/action[-=](\d+)/g));
  const last = matches[matches.length - 1];
  if (last) {
    const id = Number(last[1]);
    return { actionId: Number.isFinite(id) ? id : null, actionRef: `action-${last[1]}` };
  }
  return { actionId: null, actionRef: null };
}

/**
 * Authenticates via JSON-RPC and returns the session_id cookie value.
 * The themed website login form submits through JS (passkey/webauthn) and
 * fails intermittently — the RPC endpoint is deterministic.
 */
async function rpcAuthenticate(baseUrl: string, db: string, login: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", id: 1, params: { db, login, password } }),
  });

  const setCookie = response.headers.get("set-cookie") ?? "";
  const payload = (await response.json()) as {
    result?: { uid?: number };
    error?: { code: number; message: string };
  };

  if (payload.error) throw new Error(`RPC auth error ${payload.error.code}: ${payload.error.message}`);
  if (!payload.result?.uid) throw new Error("RPC auth failed: uid missing in response.");

  const match = /session_id=([^;,\s]+)/.exec(setCookie);
  if (!match) throw new Error("RPC auth failed: session_id cookie not returned.");
  return match[1];
}

async function login(page: Page, baseUrl: string, db: string, user: string, password: string): Promise<void> {
  await page.goto(`${baseUrl}/web/login`, { waitUntil: "domcontentloaded" });

  const loginInput = page.locator('input[name="login"]');
  if (!(await loginInput.isVisible().catch(() => false))) {
    // Already authenticated (session reuse) — nothing to do.
    return;
  }

  const dbInput = page.locator('input[name="db"]');
  if (await dbInput.isVisible().catch(() => false)) {
    await dbInput.fill(db);
  }

  await loginInput.fill(user);
  await page.locator('input[name="password"]').fill(password);
  // The website theme adds other forms/buttons (search, passkey) — submit the
  // form that actually contains the login field.
  const loginForm = page.locator('form:has(input[name="login"])').first();
  await loginForm
    .locator('button[type="submit"], button:has-text("Log in"), input[type="submit"]')
    .first()
    .click();

  // Wait until we actually leave the login page; fail loudly otherwise.
  await page
    .waitForURL((u) => !u.toString().includes("/web/login"), { timeout: 30000 })
    .catch(async () => {
      const alert = await page
        .locator(".alert-danger, .o_login_error")
        .first()
        .textContent()
        .catch(() => null);
      throw new Error(`Login failed${alert ? `: ${alert.trim()}` : " (still on /web/login after submit)"}`);
    });

  await page.waitForLoadState("domcontentloaded");
  // Let the 303 → /odoo redirect and web-client bootstrap settle before any
  // further navigation — an immediate goto can race the session handshake.
  await page.waitForTimeout(3000);
}

/**
 * Finds and clicks a module entry. Order:
 *  1. direct navbar link with matching text
 *  2. items inside each top-level navbar dropdown (opened one by one)
 * Exact (normalized) match first, then case-insensitive "contains".
 */
async function openModule(page: Page, moduleName: string): Promise<string> {
  const labels = MODULE_ALIASES[moduleName] ?? [moduleName];

  const tryClickIn = async (scopeSelector: string): Promise<string | null> => {
    for (const exact of [true, false]) {
      for (const label of labels) {
        const pattern = exact
          ? new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`)
          : new RegExp(escapeRegExp(label), "i");
        const target = page.locator(scopeSelector).filter({ hasText: pattern });
        const count = await target.count();
        for (let i = 0; i < count; i++) {
          const el = target.nth(i);
          if (await el.isVisible().catch(() => false)) {
            const text = ((await el.textContent()) ?? label).trim();
            await el.click();
            return text;
          }
        }
      }
    }
    return null;
  };

  // 1) Accessible role lookup — matches the custom theme's nav pills and links.
  for (const label of labels) {
    for (const role of ["link", "button"] as const) {
      const matches = page.getByRole(role, { name: label, exact: true });
      const count = await matches.count();
      for (let i = 0; i < count; i++) {
        const el = matches.nth(i);
        if (await el.isVisible().catch(() => false)) {
          const clicked = await el
            .click({ timeout: 5000 })
            .then(() => true)
            .catch(() => false);
          if (clicked) return label;
        }
      }
    }
  }

  // 2) Any clickable element in the header/nav with matching text.
  const direct = await tryClickIn(
    "header a, header button, nav a, nav button, .o_main_navbar a.o_nav_entry"
  );
  if (direct) return direct;

  // 3) Walk every top-level dropdown button in the navbar (stock Odoo layout)
  const dropdowns = page.locator("header button.o-dropdown, .o_main_navbar button.o-dropdown");
  const dropdownCount = await dropdowns.count();

  for (let d = 0; d < dropdownCount; d++) {
    const button = dropdowns.nth(d);
    if (!(await button.isVisible().catch(() => false))) continue;
    if (!(await button.isEnabled().catch(() => false))) continue;

    const dropdownLabel = ((await button.textContent()) ?? "").trim();
    const clicked = await button
      .click({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!clicked) continue;
    // Dropdown items render in a portal only after the click — wait for it.
    await page
      .locator(".o-dropdown--menu, .dropdown-menu.show")
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => undefined);

    const item = await tryClickIn(
      ".o-dropdown--menu .dropdown-item, .o-dropdown--menu a, .dropdown-menu.show .dropdown-item"
    );
    if (item) return dropdownLabel ? `${dropdownLabel} > ${item}` : item;

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  // 4) Dashboard "Quick Access" cards (Ward/Bed Management only exist here).
  for (const label of labels) {
    const matches = page.getByText(label, { exact: true });
    const count = await matches.count();
    for (let i = 0; i < count; i++) {
      const el = matches.nth(i);
      if (await el.isVisible().catch(() => false)) {
        const clicked = await el
          .click({ timeout: 5000 })
          .then(() => true)
          .catch(() => false);
        if (clicked) return `Dashboard card > ${label}`;
      }
    }
  }

  throw new Error(`Could not find navigation entry for module: ${moduleName}`);
}

async function waitForView(page: Page): Promise<void> {
  await page
    .locator(".o_list_view, .o_kanban_view, .o_form_view")
    .first()
    .waitFor({ state: "visible", timeout: 20000 })
    .catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
}

// NOTE: string-form evaluate is deliberate — tsx/esbuild injects a __name helper
// into serialized callbacks that does not exist in the browser page context
// ("__name is not defined"). Do NOT convert these back to arrow functions.
const EXTRACT_COLUMNS_JS = `(() => {
  const clean = (s) => (s ?? "").replace(/\\s+/g, " ").trim();
  const out = [];
  const seen = new Set();
  document.querySelectorAll(".o_list_view thead th, thead th").forEach((th) => {
    const text = clean(th.textContent);
    if (text && !seen.has(text)) { seen.add(text); out.push(text); }
  });
  return out;
})()`;

// Diagnostic: what CAN be clicked on the current page (printed on failure so
// a failed run explains itself without another debugging round-trip).
const DUMP_CLICKABLES_JS = `(() => {
  const clean = (s) => (s ?? "").replace(/\\s+/g, " ").trim();
  const out = [];
  document.querySelectorAll("a, button, [role='button'], .hp-card-name").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return;
    const text = clean(el.textContent).slice(0, 40);
    if (text) out.push(text);
  });
  return Array.from(new Set(out)).slice(0, 25);
})()`;

const EXTRACT_FORM_FIELDS_JS = `(() => {
  const clean = (s) => (s ?? "").replace(/\\s+/g, " ").trim();
  const map = new Map();
  document.querySelectorAll(".o_form_view .o_field_widget[name]").forEach((el) => {
    const name = el.getAttribute("name");
    if (!name) return;
    const required =
      el.classList.contains("o_required_modifier") ||
      !!el.closest(".o_required_modifier") ||
      el.getAttribute("aria-required") === "true" ||
      !!el.querySelector("[required], [aria-required='true']");
    let label = "";
    const input = el.querySelector("input, textarea, select");
    if (input && input.id) {
      const forLabel = document.querySelector('label[for="' + input.id + '"]');
      if (forLabel) label = clean(forLabel.textContent);
    }
    if (!label) {
      const cell = el.closest("[class*='o_cell'], .o_wrap_field, tr");
      const lbl = cell && cell.parentElement ? cell.parentElement.querySelector(".o_form_label") : null;
      if (lbl) label = clean(lbl.textContent);
    }
    const existing = map.get(name);
    if (!existing) map.set(name, { name, label, required });
    else if (!existing.required && required) existing.required = true;
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
})()`;

/**
 * Opens a form view read-only-safely: prefer clicking the first existing record;
 * fall back to "New" (never saves). Returns fields, then navigates back to list.
 */
async function captureFormFields(page: Page): Promise<FieldInfo[]> {
  const listUrl = page.url();

  const firstRow = page.locator(".o_list_view .o_data_row .o_data_cell").first();
  const newButton = page.locator(".o_list_button_add, button.o-kanban-button-new").first();

  let opened = false;
  if (await firstRow.isVisible().catch(() => false)) {
    await firstRow.click();
    opened = true;
  } else if (await newButton.isVisible().catch(() => false)) {
    await newButton.click();
    opened = true;
  }

  if (!opened) return [];

  await page
    .locator(".o_form_view")
    .first()
    .waitFor({ state: "visible", timeout: 15000 })
    .catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);

  const fields = (await page.evaluate(EXTRACT_FORM_FIELDS_JS)) as FieldInfo[];

  // Return to list WITHOUT saving; discard any unsaved-changes dialog.
  await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => undefined);
  const discard = page.locator(".modal button", { hasText: /discard/i }).first();
  if (await discard.isVisible().catch(() => false)) {
    await discard.click();
  }
  // Safety net: if goBack didn't land back on the list, navigate directly.
  if (page.url() !== listUrl) {
    await page.goto(listUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  }
  await waitForView(page);

  return fields;
}

function buildMarkdown(entries: ModuleMapEntry[], baseUrl: string): string {
  const lines: string[] = [];
  lines.push("# Module Map");
  lines.push("");
  lines.push(`GeneratedAt: ${new Date().toISOString()}`);
  lines.push(`BaseURL: ${baseUrl}`);
  lines.push("");
  lines.push("| Module | MenuPath | ActionRef | ColumnsCount | FieldsCount |");
  lines.push("|---|---|---|---:|---:|");

  for (const entry of entries) {
    lines.push(
      `| ${entry.module} | ${entry.menuPath ?? "N/A"} | ${entry.actionRef ?? "N/A"} | ${entry.columns.length} | ${entry.formFields.length} |`
    );
  }

  for (const entry of entries) {
    lines.push("");
    lines.push(`## ${entry.module}`);
    if (entry.error) {
      lines.push(`Error: ${entry.error}`);
      continue;
    }

    lines.push(`- MenuPath: ${entry.menuPath ?? "N/A"}`);
    lines.push(`- ActionRef: ${entry.actionRef ?? "N/A"}`);
    lines.push(`- ActionURL: ${entry.actionUrl}`);
    lines.push(`- Columns (${entry.columns.length}): ${entry.columns.length ? entry.columns.join(", ") : "None detected"}`);
    lines.push(`- Form Fields (${entry.formFields.length}):`);

    if (!entry.formFields.length) {
      lines.push("  - None detected");
    } else {
      for (const field of entry.formFields) {
        const label = field.label ? ` — "${field.label}"` : "";
        lines.push(`  - ${field.name}${label} (required: ${field.required ? "yes" : "no"})`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}

// Readiness = a clickable element carrying one of the module names is visible.
// Deliberately TEXT-based, not class-based: the theme is redeployed frequently
// and its class names (hp-nav-link, hp-card-name, ...) keep changing.
const MODULE_TEXT_RE =
  /^\s*(Patients|Doctors|Prescriptions|Lab Reports|IPD Details|Appointments|Billings?|Ward Management|Bed Management)\s*$/;

type Session = { browser: Browser; context: BrowserContext; page: Page };

/** Launches a browser, authenticates via RPC cookie, and lands on /odoo. */
async function openSession(
  ODOO_URL: string,
  ODOO_DB: string,
  ODOO_USER: string,
  ODOO_PASSWORD: string
): Promise<Session> {
  const browser = await chromium.launch({ headless: true });
  // Desktop-size viewport — at the 1280px default the theme collapses the
  // nav pills into a mobile menu and nothing is directly clickable.
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

  // Primary auth: JSON-RPC session injected as a browser cookie.
  const sessionId = await rpcAuthenticate(ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD);
  await context.addCookies([
    {
      name: "session_id",
      value: sessionId,
      domain: new URL(ODOO_URL).hostname,
      path: "/",
      httpOnly: true,
      secure: ODOO_URL.startsWith("https"),
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();
  await page.goto(`${ODOO_URL}/odoo`, { waitUntil: "domcontentloaded" });

  if (page.url().includes("/web/login")) {
    // Fallback: interactive form login.
    console.warn("[warn] RPC session was not accepted by the web client — falling back to form login.");
    await login(page, ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD);
    if (!new URL(page.url()).pathname.startsWith("/odoo")) {
      await page.goto(`${ODOO_URL}/odoo`, { waitUntil: "domcontentloaded" });
    }
    if (page.url().includes("/web/login")) {
      await page.screenshot({ path: "artifacts/debug-landing.png" }).catch(() => undefined);
      throw new Error(
        `Session did not persist: /odoo redirected back to login (${page.url()}) — see artifacts/debug-landing.png`
      );
    }
  }

  return { browser, context, page };
}

/**
 * Navigates to the dashboard and waits until module navigation is actually
 * mounted. Waiting on "header" alone passes too early: only the user-menu
 * button exists at that point and every module lookup then fails.
 */
async function gotoDashboard(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/odoo`, { waitUntil: "domcontentloaded" });
  await page
    .locator("a:visible, button:visible, [role='button']:visible, .hp-card-name:visible")
    .filter({ hasText: /Patients|Doctors|Prescriptions|Lab Reports|IPD Details|Appointments|Billings?|Ward Management|Bed Management/i })
    .first()
    .waitFor({ state: "visible", timeout: 45000 })
    .catch(async () => {
      await page.screenshot({ path: "artifacts/debug-landing.png" }).catch(() => undefined);
      throw new Error(
        `Module navigation never rendered on dashboard; URL: ${page.url()} — see artifacts/debug-landing.png`
      );
    });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
}

async function main() {
  const env = readEnvFile(".env");
  const ODOO_URL = normalizeBaseUrl(requireEnv(env, "ODOO_URL"));
  const ODOO_DB = requireEnv(env, "ODOO_DB");
  const ODOO_USER = requireEnv(env, "ODOO_USER");
  const ODOO_PASSWORD = requireEnv(env, "ODOO_PASSWORD");

  mkdirSync("artifacts", { recursive: true });

  let session = await openSession(ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD);

  try {
    const entries: ModuleMapEntry[] = [];
    let failureShotSaved = false;

    for (const moduleName of MODULES) {
      let entry: ModuleMapEntry | null = null;
      let lastErrorMessage = "";

      // Two attempts per module: a crashed/closed browser session is
      // relaunched between attempts instead of failing everything after it.
      for (let attempt = 1; attempt <= 2 && !entry; attempt++) {
        try {
          if (session.page.isClosed()) throw new Error("page has been closed");

          // Always start from the dashboard: nav pills AND Quick Access cards
          // (Ward/Bed only exist as cards) are guaranteed available there.
          await gotoDashboard(session.page, ODOO_URL);

          const menuPath = await openModule(session.page, moduleName);
          await waitForView(session.page);

          const actionUrl = session.page.url();
          const { actionId, actionRef } = extractAction(actionUrl);
          const columns = (await session.page.evaluate(EXTRACT_COLUMNS_JS)) as string[];
          const formFields = await captureFormFields(session.page);

          entry = { module: moduleName, menuPath, actionUrl, actionId, actionRef, columns, formFields };
          console.log(`[ok] ${moduleName} → ${menuPath} (${columns.length} cols, ${formFields.length} fields)`);
        } catch (error: any) {
          lastErrorMessage = String(error?.message ?? error);
          console.warn(`[fail attempt ${attempt}/2] ${moduleName}: ${lastErrorMessage}`);

          if (/has been closed|crashed|Target closed/i.test(lastErrorMessage)) {
            console.warn("[warn] browser session lost — relaunching a fresh session...");
            await session.browser.close().catch(() => undefined);
            session = await openSession(ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD);
            continue;
          }

          // Self-diagnosis on non-crash failures: what WAS clickable there?
          const clickables = (await session.page.evaluate(DUMP_CLICKABLES_JS).catch(() => [])) as string[];
          console.warn(`[fail] ${moduleName} — page: ${session.page.url()}`);
          console.warn(`[fail] ${moduleName} — visible clickables: ${clickables.join(" | ") || "(none)"}`);
          if (!failureShotSaved) {
            await session.page.screenshot({ path: "artifacts/debug-module-fail.png" }).catch(() => undefined);
            failureShotSaved = true;
            console.warn(`[fail] screenshot saved: artifacts/debug-module-fail.png`);
          }
        }
      }

      entries.push(
        entry ?? {
          module: moduleName,
          menuPath: null,
          actionUrl: (() => {
            try {
              return session.page.url();
            } catch {
              return "(page closed)";
            }
          })(),
          actionId: null,
          actionRef: null,
          columns: [],
          formFields: [],
          error: lastErrorMessage || "unknown failure",
        }
      );
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      baseUrl: ODOO_URL,
      modules: entries,
    };

    writeFileSync("artifacts/app_map.json", JSON.stringify(payload, null, 2), "utf8");
    writeFileSync("artifacts/module_map.md", buildMarkdown(entries, ODOO_URL), "utf8");

    const failed = entries.filter((e) => e.error).length;
    console.log("UI map generated:");
    console.log(" - artifacts/app_map.json");
    console.log(" - artifacts/module_map.md");
    console.log(`Modules processed: ${entries.length}, failed: ${failed}`);
    if (failed) process.exitCode = 2;
  } finally {
    await session.context.close().catch(() => undefined);
    await session.browser.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error("map-ui failed:", err);
  process.exit(1);
});
