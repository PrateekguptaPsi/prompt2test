import { Locator, Page } from "@playwright/test";
import { GenericModulePage } from "./GenericModulePage";

export class AppointmentsPage extends GenericModulePage {
  // Field names from healthplix.appointment (artifacts/model_schema.json):
  // required = doctor_id (many2one), appointment_date (date).
  readonly patientField: Locator;
  readonly doctorField: Locator;
  readonly dateInput: Locator;

  constructor(page: Page) {
    super(page, "Appointments");
    this.patientField = this.fieldInput("patient_id");
    this.doctorField = this.fieldInput("doctor_id");
    this.dateInput = this.fieldInput("appointment_date");
  }

  async createAppointment(doctorName: string, date: string, patientName?: string): Promise<void> {
    await this.openNewForm();
    await this.selectMany2One("doctor_id", doctorName);
    await this.dateInput.fill(date).catch(() => undefined);
    if (patientName) await this.selectMany2One("patient_id", patientName);
    await this.save();
    await this.expectSaved();
  }

  /** Negative path: appointment without the required doctor must not save. */
  async attemptCreateWithoutDoctor(): Promise<void> {
    await this.openNewForm();
    await this.save();
    await this.expectSaveBlocked();
  }

  async expectAppointmentListed(token: string): Promise<void> {
    await this.searchFor(token);
    await this.expectRecordListed(token);
  }
}
