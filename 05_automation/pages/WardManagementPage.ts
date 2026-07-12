import { Locator, Page } from "@playwright/test";
import { GenericModulePage } from "./GenericModulePage";

export class WardManagementPage extends GenericModulePage {
  // Field names from healthplix.ward (artifacts/model_schema.json):
  // required = name (char), ward_type (selection).
  readonly nameInput: Locator;
  readonly wardTypeWidget: Locator;

  constructor(page: Page) {
    super(page, "Ward Management");
    this.nameInput = this.fieldInput("name");
    this.wardTypeWidget = this.fieldWidget("ward_type");
  }

  async createWard(name: string, wardType?: string): Promise<void> {
    await this.openNewForm();
    await this.nameInput.fill(name);
    if (wardType) {
      // Selection fields render as native <select> in Odoo 17 form widgets.
      const select = this.wardTypeWidget.locator("select").first();
      if (await select.isVisible().catch(() => false)) {
        await select.selectOption({ label: wardType }).catch(() => undefined);
      }
    }
    await this.save();
    await this.expectSaved();
  }

  /** Negative path: ward without the required name must not save. */
  async attemptCreateWithoutName(): Promise<void> {
    await this.openNewForm();
    await this.save();
    await this.expectSaveBlocked();
  }

  async expectWardListed(name: string): Promise<void> {
    await this.searchFor(name);
    await this.expectRecordListed(name);
  }
}
