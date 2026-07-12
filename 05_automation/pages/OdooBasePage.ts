import { expect, Locator, Page } from "@playwright/test";
import { getAutomationEnv } from "../utils/env";
import { reauthenticatePage } from "../utils/rpcAuth";

// Readiness = a clickable element carrying one of the module names is visible.
// TEXT-based on purpose: the theme is redeployed frequently and its CSS class
// names change; module labels are the only stable contract (same approach
// that made scripts/map-ui.ts green).
const MODULE_NAV_RE =
  /^\s*(Patients|Doctors|Prescriptions|Lab Reports|IPD Details|Appointments|Billings?|Ward Management|Bed Management)\s*$/;

// On-screen labels sometimes differ from module names (top nav says "Billings",
// the dashboard card says "Billing"; Ward/Bed exist only as dashboard cards).
const MODULE_LABEL_ALIASES: Record<string, string[]> = {
  Billing: ["Billing", "Billings"],
  "IPD Details": ["IPD Details", "IPD Management", "IPD"],
  "Lab Reports": ["Lab Reports", "Lab Report"],
  "Ward Management": ["Ward Management", "Wards", "Ward"],
  "Bed Management": ["Bed Management", "Beds", "Bed"],
};

export class OdooBasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Lands on the dashboard with module navigation mounted.
   * - NEVER uses waitForLoadState("networkidle"): Odoo's longpolling/bus keeps
   *   the network permanently busy, so networkidle deadlocks until timeout.
   * - Self-heals an expired session by re-authenticating via JSON-RPC instead
   *   of failing the test.
   */
  async gotoDashboard(): Promise<void> {
    await this.page.goto("/odoo", { waitUntil: "domcontentloaded" });

    if (this.page.url().includes("/web/login")) {
      await reauthenticatePage(this.page, getAutomationEnv());
      await this.page.goto("/odoo", { waitUntil: "domcontentloaded" });
      if (this.page.url().includes("/web/login")) {
        throw new Error("Authentication failed even after JSON-RPC session refresh.");
      }
    }

    // Wait for real module navigation, not just the header shell — the OWL
    // client renders the header/user menu well before the nav pills/cards.
    // filter({ visible: true }) is essential: the DOM also contains HIDDEN
    // stock-Odoo menu buttons with the same labels, and .first() without the
    // visibility filter latches onto one of those and waits forever.
    await this.page
      .locator("a, button, [role='button']")
      .filter({ hasText: MODULE_NAV_RE })
      .filter({ visible: true })
      .first()
      .waitFor({ state: "visible", timeout: 45_000 });
  }

  async openTopNavModule(moduleName: string): Promise<void> {
    const labels = MODULE_LABEL_ALIASES[moduleName] ?? [moduleName];
    const beforeUrl = this.page.url();

    // 1) Nav pills / links by accessible role (visible match wins).
    for (const label of labels) {
      for (const role of ["link", "button"] as const) {
        const matches = this.page.getByRole(role, { name: label, exact: true });
        const count = await matches.count();
        for (let i = 0; i < count; i++) {
          const el = matches.nth(i);
          if (await el.isVisible().catch(() => false)) {
            const clicked = await el
              .click({ timeout: 5_000 })
              .then(() => true)
              .catch(() => false);
            if (clicked) {
              await this.awaitSpaNavigation(beforeUrl);
              return;
            }
          }
        }
      }
    }

    // 2) Dashboard Quick Access cards (Ward/Bed Management only exist here).
    for (const label of labels) {
      const matches = this.page.getByText(label, { exact: true });
      const count = await matches.count();
      for (let i = 0; i < count; i++) {
        const el = matches.nth(i);
        if (await el.isVisible().catch(() => false)) {
          const clicked = await el
            .click({ timeout: 5_000 })
            .then(() => true)
            .catch(() => false);
          if (clicked) {
            await this.awaitSpaNavigation(beforeUrl);
            return;
          }
        }
      }
    }

    throw new Error(`No visible navigation entry found for module: ${moduleName}`);
  }

  /**
   * Module nav clicks are SPA action switches (href="#") — the URL updates to
   * a nested /odoo/action-XXX/action-YYY. Without this wait the next step can
   * read the PREVIOUS page (e.g. dashboard) and see wrong/empty content.
   */
  private async awaitSpaNavigation(beforeUrl: string): Promise<void> {
    await this.page
      .waitForURL((u) => u.toString() !== beforeUrl, { timeout: 30_000 })
      .catch(() => undefined);
  }

  // NOTE: the theme keeps HIDDEN duplicates of stock Odoo structures in the
  // DOM (nav menus, list views). Every stock-class locator must therefore be
  // narrowed with filter({ visible: true }) before .first().

  protected visibleListView() {
    return this.page.locator(".o_list_view").filter({ visible: true }).first();
  }

  protected visibleFormView() {
    return this.page.locator(".o_form_view").filter({ visible: true }).first();
  }

  async waitForListView(): Promise<void> {
    await this.visibleListView().waitFor({ state: "visible", timeout: 45_000 });
    // The .o_list_view container mounts BEFORE the table renders (a "Loading"
    // toast shows meanwhile) — wait for real header cells, not the shell.
    await this.visibleListView()
      .locator("thead th")
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
  }

  async waitForFormView(): Promise<void> {
    await this.visibleFormView().waitFor({ state: "visible", timeout: 30_000 });
  }

  async clickNew(): Promise<void> {
    const roleButton = this.page.getByRole("button", { name: "New", exact: true }).filter({ visible: true }).first();
    if (await roleButton.isVisible().catch(() => false)) {
      await roleButton.click();
    } else {
      // Stock Odoo class (stable across theme redeploys, unlike hp-* classes).
      await this.page.locator(".o_list_button_add").filter({ visible: true }).first().click();
    }
    await this.waitForFormView();
  }

  async saveForm(): Promise<void> {
    const roleButton = this.page.getByRole("button", { name: /^save/i }).filter({ visible: true }).first();
    if (await roleButton.isVisible().catch(() => false)) {
      await roleButton.click();
      return;
    }
    const stockButton = this.page.locator(".o_form_button_save").filter({ visible: true }).first();
    if (await stockButton.isVisible().catch(() => false)) {
      await stockButton.click();
      return;
    }
    await this.page.getByText("Save", { exact: true }).filter({ visible: true }).first().click();
  }

  /**
   * Abandons the current (possibly dirty) form so the next navigation is not
   * blocked by the unsaved-changes dialog — a major source of cascade
   * timeouts in the previous run.
   */
  async discardForm(): Promise<void> {
    const discardButton = this.page.getByRole("button", { name: /discard/i }).filter({ visible: true }).first();
    if (await discardButton.isVisible().catch(() => false)) {
      await discardButton.click().catch(() => undefined);
    }
    await this.dismissBlockingModal();
  }

  /**
   * Closes any modal dialog that would intercept the next click — Odoo shows
   * unsaved-changes confirmations and server error dialogs (.o_technical_modal)
   * that overlay the whole client and block subsequent interactions.
   */
  async dismissBlockingModal(): Promise<void> {
    const modal = this.page.locator(".modal.show, .modal.d-block").first();
    if (!(await modal.isVisible().catch(() => false))) return;

    const action = modal.getByRole("button", { name: /discard|ok|close|stay here/i }).first();
    if (await action.isVisible().catch(() => false)) {
      await action.click().catch(() => undefined);
    } else {
      await this.page.keyboard.press("Escape").catch(() => undefined);
    }
    await modal.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
  }

  async getColumnHeaders(): Promise<string[]> {
    await this.waitForListView();
    const headers = await this.visibleListView().locator("thead th").allInnerTexts();
    return headers.map((h) => h.trim()).filter((h) => h.length > 0);
  }

  async searchInCurrentModule(query: string): Promise<void> {
    // A leftover modal (error/confirm) would intercept the search click.
    await this.dismissBlockingModal();

    // Stock Odoo search input (class is core web client, not theme).
    const stockInput = this.page.locator(".o_searchview_input").filter({ visible: true }).first();
    if (await stockInput.isVisible().catch(() => false)) {
      await stockInput.click();
      await stockInput.fill(query);
      await stockInput.press("Enter");
      return;
    }

    const searchBox = this.page.getByRole("searchbox").first();
    if (await searchBox.isVisible().catch(() => false)) {
      await searchBox.fill(query);
      await searchBox.press("Enter");
    }
  }

  async expectTextVisible(text: string): Promise<void> {
    // visible-filter first: hidden stock-Odoo nodes can carry the same text.
    await expect(
      this.page.getByText(text, { exact: false }).filter({ visible: true }).first()
    ).toBeVisible({ timeout: 15_000 });
  }

  async startNewRecord(): Promise<void> {
    await this.clickNew();
  }

  async submitCurrentForm(): Promise<void> {
    await this.saveForm();
  }

  /** True when Odoo is showing a client-side required/invalid field marker or an error notification. */
  async hasValidationError(): Promise<boolean> {
    const invalidField = this.page.locator(".o_field_invalid, .o_form_editable .o_required_modifier.o_field_invalid").first();
    if (await invalidField.isVisible().catch(() => false)) return true;

    const notification = this.page.locator(".o_notification_manager .o_notification, .o_error_dialog").first();
    return notification.isVisible().catch(() => false);
  }

  async fillCaseFields(
    bindings: Array<{ fieldName: string; label?: string; value: string }>
  ): Promise<{ filledFields: string[]; skippedFields: string[] }> {
    const filledFields: string[] = [];
    const skippedFields: string[] = [];

    for (const binding of bindings) {
      const filled = await this.fillSingleField(binding.fieldName, binding.label, binding.value);
      if (filled) filledFields.push(binding.fieldName);
      else skippedFields.push(binding.fieldName);
    }

    return { filledFields, skippedFields };
  }

  async expectNewButtonVisible(): Promise<void> {
    const roleButton = this.page.getByRole("button", { name: "New", exact: true }).filter({ visible: true }).first();
    const stockButton = this.page.locator(".o_list_button_add").filter({ visible: true }).first();

    const roleVisible = await roleButton.isVisible().catch(() => false);
    const stockVisible = await stockButton.isVisible().catch(() => false);
    expect(roleVisible || stockVisible, "New button not visible on list view").toBeTruthy();
  }

  async expectListOrFormVisible(): Promise<void> {
    const isListVisible = await this.visibleListView().isVisible().catch(() => false);
    const isFormVisible = await this.visibleFormView().isVisible().catch(() => false);

    expect(isListVisible || isFormVisible).toBeTruthy();
  }

  private async fillSingleField(fieldName: string, label: string | undefined, value: string): Promise<boolean> {
    const normalizedValue = value.trim();
    if (!normalizedValue) return false;

    if (label) {
      const labeled = this.page.getByLabel(label, { exact: false }).first();
      if (await labeled.isVisible().catch(() => false)) {
        const filledByLabel = await this.tryFillControl(labeled, normalizedValue);
        if (filledByLabel) return true;
      }
    }

    const byExplicitName = this.page
      .locator(`input[name="${fieldName}"], textarea[name="${fieldName}"], select[name="${fieldName}"]`)
      .first();
    if (await byExplicitName.isVisible().catch(() => false)) {
      const filledByName = await this.tryFillControl(byExplicitName, normalizedValue);
      if (filledByName) return true;
    }

    const byWidgetName = this.page
      .locator(
        `.o_field_widget[name="${fieldName}"] input, .o_field_widget[name="${fieldName}"] textarea, .o_field_widget[name="${fieldName}"] [contenteditable="true"]`
      )
      .first();
    if (await byWidgetName.isVisible().catch(() => false)) {
      const filledByWidget = await this.tryFillControl(byWidgetName, normalizedValue);
      if (filledByWidget) return true;
    }

    return false;
  }

  private async tryFillControl(control: Locator, value: string): Promise<boolean> {
    try {
      await control.click({ timeout: 3_000 });
    } catch {
      // no-op
    }

    try {
      await control.fill(value);
      // Close the autocomplete dropdown a many2one fill opens, so it does not
      // swallow the next click. Escape only when a dropdown is actually open —
      // a bare Escape in a form view triggers the discard flow.
      const autocomplete = this.page.locator(".o-autocomplete--dropdown-menu, .ui-autocomplete").first();
      if (await autocomplete.isVisible().catch(() => false)) {
        await this.page.keyboard.press("Escape").catch(() => undefined);
      }
      return true;
    } catch {
      // Try keyboard fallback for combo/contenteditable widgets
    }

    try {
      await this.page.keyboard.press("Control+A");
      await this.page.keyboard.type(value);
      await this.page.keyboard.press("Enter");
      return true;
    } catch {
      return false;
    }
  }
}
