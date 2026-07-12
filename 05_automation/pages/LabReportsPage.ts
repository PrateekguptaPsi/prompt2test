import { Locator, Page } from "@playwright/test";
import { GenericModulePage } from "./GenericModulePage";

export class LabReportsPage extends GenericModulePage {
  // Field names from healthplix.lab.report (artifacts/model_schema.json):
  // required = patient_id (many2one), date (datetime).
  readonly patientField: Locator;
  readonly dateInput: Locator;

  constructor(page: Page) {
    super(page, "Lab Reports");
    this.patientField = this.fieldInput("patient_id");
    this.dateInput = this.fieldInput("date");
  }

  async createLabReportFor(patientName: string): Promise<void> {
    await this.openNewForm();
    await this.selectMany2One("patient_id", patientName);
    await this.save();
    await this.expectSaved();
  }

  /** Negative path: lab report without a patient must not save. */
  async attemptCreateWithoutPatient(): Promise<void> {
    await this.openNewForm();
    await this.save();
    await this.expectSaveBlocked();
  }

  async expectLabReportListed(token: string): Promise<void> {
    await this.searchFor(token);
    await this.expectRecordListed(token);
  }
}
