import { expect, Locator, Page } from "@playwright/test";
import { OdooBasePage } from "./OdooBasePage";

/**
 * Engine shared by every module page object.
 *
 * Locator strategy (stability order for this frequently-redeployed theme):
 *  1. Odoo field widget names from artifacts/model_schema.json — server-side
 *     model contract, survives theme redeploys.
 *  2. Accessible roles / visible text.
 *  3. Stock Odoo web-client classes (.o_list_view etc.) — core framework, not
 *     theme. Theme classes (hp-*) are FORBIDDEN.
 */
export class GenericModulePage extends OdooBasePage {
  readonly moduleName: string;

  constructor(page: Page, moduleName: string) {
    super(page);
    this.moduleName = moduleName;
  }

  // ---------- Locator factory (schema-driven, theme-proof) ----------

  /** Input/textarea inside an Odoo field widget, by model field name. */
  fieldInput(fieldName: string): Locator {
    return this.page
      .locator(
        `.o_field_widget[name="${fieldName}"] input, .o_field_widget[name="${fieldName}"] textarea`
      )
      .filter({ visible: true })
      .first();
  }

  /** The whole field widget cell (for state assertions like o_field_invalid). */
  fieldWidget(fieldName: string): Locator {
    return this.page.locator(`.o_field_widget[name="${fieldName}"]`).filter({ visible: true }).first();
  }

  get newButton(): Locator {
    return this.page.getByRole("button", { name: "New", exact: true }).filter({ visible: true }).first();
  }

  get saveButton(): Locator {
    return this.page.getByRole("button", { name: /^save/i }).filter({ visible: true }).first();
  }

  get searchInput(): Locator {
    return this.page.locator(".o_searchview_input").filter({ visible: true }).first();
  }

  // ---------- Navigation ----------

  async open(): Promise<void> {
    await this.gotoDashboard();
    await this.openTopNavModule(this.moduleName);
    await this.waitForListView();
  }

  // ---------- Form operations ----------

  async openNewForm(): Promise<void> {
    await this.clickNew();
  }

  async fillField(fieldName: string, value: string): Promise<void> {
    const input = this.fieldInput(fieldName);
    await input.click();
    await input.fill(value);
  }

  /**
   * Fills a many2one (relational) field: type, wait for the autocomplete,
   * pick the first matching suggestion (or "Create" entry when offered).
   */
  async selectMany2One(fieldName: string, text: string): Promise<void> {
    const input = this.fieldInput(fieldName);
    await input.click();
    await input.fill(text);

    const dropdown = this.page.locator(".o-autocomplete--dropdown-menu, .ui-autocomplete").filter({ visible: true }).first();
    await dropdown.waitFor({ state: "visible", timeout: 10_000 });

    const exact = dropdown.getByText(text, { exact: false }).first();
    if (await exact.isVisible().catch(() => false)) {
      await exact.click();
    } else {
      await this.page.keyboard.press("Enter");
    }
  }

  async save(): Promise<void> {
    await this.saveForm();
  }

  async discard(): Promise<void> {
    await this.discardForm();
  }

  // ---------- Assertions ----------

  /** After saving, the record stays open in a form whose breadcrumb is no longer "New". */
  async expectSaved(): Promise<void> {
    await expect(this.saveButton).toBeHidden({ timeout: 15_000 });
    const invalid = this.page.locator(".o_field_invalid").filter({ visible: true }).first();
    await expect(invalid).toBeHidden();
  }

  /** Save must have been blocked: invalid marker/notification shown or form still dirty. */
  async expectSaveBlocked(): Promise<void> {
    const validationShown = await this.hasValidationError();
    const saveStillVisible = await this.saveButton.isVisible().catch(() => false);
    expect(validationShown || saveStillVisible, "Expected save to be blocked with validation feedback").toBeTruthy();
  }

  async expectFieldInvalid(fieldName: string): Promise<void> {
    await expect(this.fieldWidget(fieldName)).toHaveClass(/o_field_invalid/, { timeout: 10_000 });
  }

  async searchFor(query: string): Promise<void> {
    await this.searchInCurrentModule(query);
  }

  async expectRecordListed(text: string): Promise<void> {
    await this.expectTextVisible(text);
  }
}
