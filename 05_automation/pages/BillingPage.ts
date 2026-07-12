import { Locator, Page } from "@playwright/test";
import { GenericModulePage } from "./GenericModulePage";

export class BillingPage extends GenericModulePage {
  // Field names from healthplix.billing (artifacts/model_schema.json):
  // required = patient_id; totals are computed from healthplix.billing.line.
  readonly patientField: Locator;

  constructor(page: Page) {
    // Module name stays "Billing" — MODULE_LABEL_ALIASES resolves both the
    // top-nav pill labelled "Billings" and the dashboard card "Billing".
    super(page, "Billing");
    this.patientField = this.fieldInput("patient_id");
  }

  async createBillFor(patientName: string): Promise<void> {
    await this.openNewForm();
    await this.selectMany2One("patient_id", patientName);
    await this.save();
    await this.expectSaved();
  }

  /** Negative path: bill without a patient must not save. */
  async attemptCreateWithoutPatient(): Promise<void> {
    await this.openNewForm();
    await this.save();
    await this.expectSaveBlocked();
  }

  async expectBillListed(token: string): Promise<void> {
    await this.searchFor(token);
    await this.expectRecordListed(token);
  }
}
