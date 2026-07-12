import { test as base } from "@playwright/test";
import { PatientsPage } from "../pages/PatientsPage";
import { DoctorsPage } from "../pages/DoctorsPage";
import { PrescriptionsPage } from "../pages/PrescriptionsPage";
import { LabReportsPage } from "../pages/LabReportsPage";
import { IPDDetailsPage } from "../pages/IPDDetailsPage";
import { AppointmentsPage } from "../pages/AppointmentsPage";
import { BillingPage } from "../pages/BillingPage";
import { WardManagementPage } from "../pages/WardManagementPage";
import { BedManagementPage } from "../pages/BedManagementPage";

type ModulePages = {
  patientsPage: PatientsPage;
  doctorsPage: DoctorsPage;
  prescriptionsPage: PrescriptionsPage;
  labReportsPage: LabReportsPage;
  ipdDetailsPage: IPDDetailsPage;
  appointmentsPage: AppointmentsPage;
  billingPage: BillingPage;
  wardManagementPage: WardManagementPage;
  bedManagementPage: BedManagementPage;
};

export const test = base.extend<ModulePages>({
  patientsPage: async ({ page }, use) => use(new PatientsPage(page)),
  doctorsPage: async ({ page }, use) => use(new DoctorsPage(page)),
  prescriptionsPage: async ({ page }, use) => use(new PrescriptionsPage(page)),
  labReportsPage: async ({ page }, use) => use(new LabReportsPage(page)),
  ipdDetailsPage: async ({ page }, use) => use(new IPDDetailsPage(page)),
  appointmentsPage: async ({ page }, use) => use(new AppointmentsPage(page)),
  billingPage: async ({ page }, use) => use(new BillingPage(page)),
  wardManagementPage: async ({ page }, use) => use(new WardManagementPage(page)),
  bedManagementPage: async ({ page }, use) => use(new BedManagementPage(page)),
});

export { expect } from "@playwright/test";
