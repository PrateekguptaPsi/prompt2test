import { Locator, Page } from "@playwright/test";
import { GenericModulePage } from "./GenericModulePage";

export type PatientData = {
  name: string;
  phone?: string;
  email?: string;
};

export class PatientsPage extends GenericModulePage {
  // Field names from healthplix.patient (artifacts/model_schema.json).
  readonly nameInput: Locator;
  readonly phoneInput: Locator;
  readonly emailInput: Locator;

  constructor(page: Page) {
    super(page, "Patients");
    this.nameInput = this.fieldInput("name");
    this.phoneInput = this.fieldInput("phone");
    this.emailInput = this.fieldInput("email");
  }

  async createPatient(data: PatientData): Promise<void> {
    await this.openNewForm();
    await this.nameInput.fill(data.name);
    if (data.phone) await this.phoneInput.fill(data.phone).catch(() => undefined);
    if (data.email) await this.emailInput.fill(data.email).catch(() => undefined);
    await this.save();
    await this.expectSaved();
  }

  /** Negative path: submit with the required name empty; save must be blocked. */
  async attemptCreateWithoutName(data: Omit<PatientData, "name">): Promise<void> {
    await this.openNewForm();
    if (data.phone) await this.phoneInput.fill(data.phone).catch(() => undefined);
    if (data.email) await this.emailInput.fill(data.email).catch(() => undefined);
    await this.save();
    await this.expectSaveBlocked();
  }

  async expectPatientListed(name: string): Promise<void> {
    await this.searchFor(name);
    await this.expectRecordListed(name);
  }
}
