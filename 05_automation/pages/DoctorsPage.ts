import { Locator, Page } from "@playwright/test";
import { GenericModulePage } from "./GenericModulePage";

export class DoctorsPage extends GenericModulePage {
  // Field names from healthplix.doctor (artifacts/model_schema.json).
  readonly nameInput: Locator;
  readonly phoneInput: Locator;
  readonly emailInput: Locator;

  constructor(page: Page) {
    super(page, "Doctors");
    this.nameInput = this.fieldInput("name");
    this.phoneInput = this.fieldInput("phone");
    this.emailInput = this.fieldInput("email");
  }

  async createDoctor(name: string, phone?: string): Promise<void> {
    await this.openNewForm();
    await this.nameInput.fill(name);
    if (phone) await this.phoneInput.fill(phone).catch(() => undefined);
    await this.save();
    await this.expectSaved();
  }

  /** Negative path: doctor without the required name must not save. */
  async attemptCreateWithoutName(): Promise<void> {
    await this.openNewForm();
    await this.save();
    await this.expectSaveBlocked();
  }

  async expectDoctorListed(name: string): Promise<void> {
    await this.searchFor(name);
    await this.expectRecordListed(name);
  }
}
