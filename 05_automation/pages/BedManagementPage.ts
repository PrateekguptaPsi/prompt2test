import { Locator, Page } from "@playwright/test";
import { GenericModulePage } from "./GenericModulePage";

export class BedManagementPage extends GenericModulePage {
  // Field names from healthplix.bed (artifacts/model_schema.json):
  // required = bed_number (char), ward_id (many2one).
  readonly bedNumberInput: Locator;
  readonly wardField: Locator;

  constructor(page: Page) {
    super(page, "Bed Management");
    this.bedNumberInput = this.fieldInput("bed_number");
    this.wardField = this.fieldInput("ward_id");
  }

  async createBed(bedNumber: string, wardName: string): Promise<void> {
    await this.openNewForm();
    await this.bedNumberInput.fill(bedNumber);
    await this.selectMany2One("ward_id", wardName);
    await this.save();
    await this.expectSaved();
  }

  /** Negative path: bed without required number/ward must not save. */
  async attemptCreateWithoutRequiredFields(): Promise<void> {
    await this.openNewForm();
    await this.save();
    await this.expectSaveBlocked();
  }

  async expectBedListed(bedNumber: string): Promise<void> {
    await this.searchFor(bedNumber);
    await this.expectRecordListed(bedNumber);
  }
}
