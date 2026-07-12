import { Locator, Page } from "@playwright/test";
import { GenericModulePage } from "./GenericModulePage";

export class PrescriptionsPage extends GenericModulePage {
  // Field names from healthplix.prescription (artifacts/model_schema.json):
  // patient_id is the only required writable field; medication lines live in
  // healthplix.prescription.line (one2many widget on the form).
  readonly patientField: Locator;
  readonly doctorField: Locator;

  constructor(page: Page) {
    super(page, "Prescriptions");
    this.patientField = this.fieldInput("patient_id");
    this.doctorField = this.fieldInput("doctor_id");
  }

  async createPrescriptionFor(patientName: string): Promise<void> {
    await this.openNewForm();
    await this.selectMany2One("patient_id", patientName);
    await this.save();
    await this.expectSaved();
  }

  /** Negative path: prescription without a patient must not save. */
  async attemptCreateWithoutPatient(): Promise<void> {
    await this.openNewForm();
    await this.save();
    await this.expectSaveBlocked();
  }

  async expectPrescriptionListed(token: string): Promise<void> {
    await this.searchFor(token);
    await this.expectRecordListed(token);
  }
}
