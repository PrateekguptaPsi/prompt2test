import { Locator, Page } from "@playwright/test";
import { GenericModulePage } from "./GenericModulePage";

export class IPDDetailsPage extends GenericModulePage {
  // healthplix.ipd (artifacts/model_schema.json) has no required writable
  // fields; the admission workflow is driven by patient/ward/bed relations.
  readonly patientField: Locator;
  readonly wardField: Locator;
  readonly bedField: Locator;

  constructor(page: Page) {
    super(page, "IPD Details");
    this.patientField = this.fieldInput("patient_id");
    this.wardField = this.fieldInput("ward_id");
    this.bedField = this.fieldInput("bed_id");
  }

  async createAdmissionFor(patientName: string): Promise<void> {
    await this.openNewForm();
    await this.selectMany2One("patient_id", patientName);
    await this.save();
    await this.expectSaved();
  }

  async expectAdmissionListed(token: string): Promise<void> {
    await this.searchFor(token);
    await this.expectRecordListed(token);
  }
}
