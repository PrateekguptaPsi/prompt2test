# Scenarios — Oncology HMS (Step 4)

## ScenarioID: SCN-PAT-CORE-01
- ScenarioName: Safe Patient Registration with Required Identity Capture
- Band: Core
- LinkedRequirementIDs: REQ-PATIENTS-1
- ModulesInvolved: Patients
- Preconditions:
  1. User has registration access to Patients module.
  2. No existing patient record with the same identity context for current registration event.
- Trigger: Registrar initiates creation of a new patient profile.
- MainFlow:
  1. Open Patients module and start a new patient registration.
  2. Enter mandatory patient name and key demographics.
  3. Add contact and identity information for traceability.
  4. Save patient profile.
  5. Verify patient is visible for downstream appointment/prescription/lab/IPD/billing linkage.
- AlternateOrExceptionFlow:
  1. If required name is missing, system blocks save and highlights required field.
  2. If user attempts unauthorized record access for another patient, system denies access.
- ExpectedOutcome: A uniquely identifiable patient record is created and reusable across clinical and billing workflows.
- RiskIfFailed: Wrong or incomplete patient identification can lead to treatment on the wrong patient record.
- SeverityIfFailed: Critical
- Priority: P0

---

## ScenarioID: SCN-DOC-CORE-01
- ScenarioName: Doctor Profile Availability for Clinical Assignment
- Band: Core
- LinkedRequirementIDs: REQ-DOCTORS-1
- ModulesInvolved: Doctors, Appointments, Lab Reports
- Preconditions:
  1. User has permission to manage doctor records.
  2. No active duplicate profile exists for the same doctor identity.
- Trigger: Admin creates or updates a doctor profile for assignment.
- MainFlow:
  1. Open Doctors module and create/update doctor details.
  2. Save specialization and contact context.
  3. Confirm doctor appears in appointment assignment options.
  4. Confirm doctor appears in lab referral options.
- AlternateOrExceptionFlow:
  1. If name is missing, system blocks save.
  2. If doctor is inactive, system prevents new appointment/referral assignment.
- ExpectedOutcome: Only valid active doctor profiles are available for patient care assignment.
- RiskIfFailed: Incorrect doctor assignment can delay treatment and break clinical accountability.
- SeverityIfFailed: High
- Priority: P1

---

## ScenarioID: SCN-APT-ALT-01
- ScenarioName: Appointment Scheduling with Conflict and Mandatory Checks
- Band: Alternate
- LinkedRequirementIDs: REQ-APPOINTMENTS-1
- ModulesInvolved: Appointments, Patients, Doctors
- Preconditions:
  1. Patient and doctor records exist.
  2. Scheduler has appointment booking rights.
- Trigger: Scheduler creates an appointment request.
- MainFlow:
  1. Open Appointments and create new booking.
  2. Select patient, doctor, appointment date, and consultation context.
  3. Save appointment and verify appointment number generation.
- AlternateOrExceptionFlow:
  1. Attempt save without doctor or appointment date; system rejects save.
  2. Attempt duplicate booking for same patient-doctor-time slot; system prevents conflict booking.
- ExpectedOutcome: Valid appointments are scheduled; invalid or conflicting bookings are blocked.
- RiskIfFailed: Scheduling defects can delay oncology consultations and treatment start.
- SeverityIfFailed: High
- Priority: P1

---

## ScenarioID: SCN-RX-CORE-01
- ScenarioName: Prescription Creation with Safe Medication Line Validation
- Band: Core
- LinkedRequirementIDs: REQ-PRESCRIPTIONS-1
- ModulesInvolved: Prescriptions, Appointments, Patients
- Preconditions:
  1. Patient and appointment context exists.
  2. Prescriber has prescription authoring rights.
- Trigger: Clinician creates treatment prescription.
- MainFlow:
  1. Open Prescriptions and start new prescription for selected patient.
  2. Link prescription to appointment context when applicable.
  3. Add one or more medication lines with dosage/duration.
  4. Save prescription and verify reference creation.
  5. Confirm lines are retained under the same prescription context.
- AlternateOrExceptionFlow:
  1. If patient linkage is missing, system blocks save.
  2. If medication quantity is zero/negative, system rejects medication line.
  3. If interaction/allergy conflict is detected, system enforces fail-safe stop/warning.
- ExpectedOutcome: Only clinically valid, traceable prescriptions are saved for the correct patient.
- RiskIfFailed: Unsafe prescription acceptance can cause serious medication harm.
- SeverityIfFailed: Critical
- Priority: P0

---

## ScenarioID: SCN-LAB-ALT-01
- ScenarioName: Lab Report Validation with Out-of-Range and Patient-Mismatch Protection
- Band: Alternate
- LinkedRequirementIDs: REQ-LABREPORTS-1
- ModulesInvolved: Lab Reports, Patients, Doctors
- Preconditions:
  1. Patient record exists.
  2. Lab user has report creation permissions.
- Trigger: Lab staff enters report details for ordered tests.
- MainFlow:
  1. Open Lab Reports and create new report.
  2. Enter required report reference, patient, and report date.
  3. Add referral/test metadata and result artifacts.
  4. Save report and confirm patient linkage.
- AlternateOrExceptionFlow:
  1. Attempt save without required patient/date; system blocks save.
  2. Enter out-of-range result context; system flags or blocks until validation.
  3. Attempt attach/report against wrong patient; system prevents cross-patient assignment.
- ExpectedOutcome: Lab data is accepted only with correct required context and safe validation handling.
- RiskIfFailed: Invalid lab data may lead to incorrect treatment decisions.
- SeverityIfFailed: Critical
- Priority: P0

---

## ScenarioID: SCN-IPD-CORE-01
- ScenarioName: IPD Admission, Bed Assignment, and Controlled Discharge
- Band: Core
- LinkedRequirementIDs: REQ-IPD-1, REQ-WARD-1, REQ-BED-1
- ModulesInvolved: IPD Details, Ward Management, Bed Management, Patients, Doctors
- Preconditions:
  1. Patient and responsible doctor exist.
  2. Ward and bed inventory exists with available bed.
- Trigger: Care team initiates inpatient admission.
- MainFlow:
  1. Open IPD Details and create admission record for selected patient.
  2. Assign doctor, ward, and available bed.
  3. Track inpatient progression and related care context.
  4. Update discharge details when treatment is complete.
  5. Verify IPD status supports downstream billing flow.
- AlternateOrExceptionFlow:
  1. Attempt assign already occupied bed; system blocks assignment.
  2. Attempt continue active treatment updates after discharge status; system prevents invalid state transition.
- ExpectedOutcome: IPD lifecycle is safely managed from admission to discharge with valid bed/ward control.
- RiskIfFailed: Bed conflicts and invalid discharge state can disrupt care continuity and patient safety.
- SeverityIfFailed: High
- Priority: P1

---

## ScenarioID: SCN-BIL-ALT-01
- ScenarioName: Billing Assembly with Duplicate/Negative Charge Prevention
- Band: Alternate
- LinkedRequirementIDs: REQ-BILLING-1
- ModulesInvolved: Billing, Appointments, Prescriptions, Lab Reports, IPD Details
- Preconditions:
  1. Patient has one or more billable care events.
  2. Billing user has invoice creation rights.
- Trigger: Billing officer compiles patient charges.
- MainFlow:
  1. Open Billing and create patient billing record.
  2. Add eligible line items from appointment/lab/prescription/IPD contexts.
  3. Verify computed total equals sum of active line subtotals.
  4. Save billing and confirm status/totals are visible.
- AlternateOrExceptionFlow:
  1. Attempt save without patient linkage; system blocks save.
  2. Add negative amount line; system rejects invalid charge.
  3. Add duplicate line for same service event; system prevents duplicate billing.
- ExpectedOutcome: Billing totals are accurate, traceable, and protected from invalid charge patterns.
- RiskIfFailed: Billing errors can delay discharge and cause financial/patient-trust impact.
- SeverityIfFailed: High
- Priority: P1

---

## ScenarioID: SCN-WARD-CORE-01
- ScenarioName: Ward Definition with Required Capacity Classification
- Band: Core
- LinkedRequirementIDs: REQ-WARD-1
- ModulesInvolved: Ward Management
- Preconditions:
  1. Operations manager has ward configuration rights.
- Trigger: New ward setup or ward metadata update is initiated.
- MainFlow:
  1. Open Ward Management and create/update ward record.
  2. Enter ward name, type, floor, and planning details.
  3. Save ward and verify availability for bed allocation planning.
- AlternateOrExceptionFlow:
  1. Attempt save without ward name or ward type; system blocks save.
- ExpectedOutcome: Ward master data remains complete and usable for bed/IPD operations.
- RiskIfFailed: Incomplete ward setup can cause bed allocation and inpatient planning errors.
- SeverityIfFailed: Medium
- Priority: P2

---

## ScenarioID: SCN-BED-ALT-01
- ScenarioName: Bed Inventory Control with Occupancy Conflict Prevention
- Band: Alternate
- LinkedRequirementIDs: REQ-BED-1, REQ-IPD-1
- ModulesInvolved: Bed Management, Ward Management, IPD Details
- Preconditions:
  1. Ward records are available.
  2. Bed manager has inventory update rights.
- Trigger: Bed creation or assignment-readiness update is initiated.
- MainFlow:
  1. Open Bed Management and create/update bed record with ward mapping.
  2. Save bed details including status and charge.
  3. Verify bed appears in IPD assignment options according to status.
- AlternateOrExceptionFlow:
  1. Attempt save without bed number/ward linkage; system blocks save.
  2. Attempt assign one bed to multiple active patients; system prevents conflict.
- ExpectedOutcome: Bed inventory remains consistent with safe occupancy controls.
- RiskIfFailed: Bed conflicts can create unsafe inpatient placement and care disruptions.
- SeverityIfFailed: High
- Priority: P1

---

## ScenarioID: SCN-E2E-ONCO-01
- ScenarioName: End-to-End Oncology Care Journey from Registration to Billing
- Band: Cross-Module E2E
- LinkedRequirementIDs: REQ-PATIENTS-1, REQ-APPOINTMENTS-1, REQ-PRESCRIPTIONS-1, REQ-LABREPORTS-1, REQ-IPD-1, REQ-BILLING-1, REQ-WARD-1, REQ-BED-1
- ModulesInvolved: Patients, Appointments, Prescriptions, Lab Reports, IPD Details, Ward Management, Bed Management, Billing
- Preconditions:
  1. Clinical users across registration, consultation, lab, IPD, and billing are available.
  2. Required doctor/ward/bed masters exist.
  3. Patient has no active conflicting admission at flow start.
- Trigger: New oncology patient enters complete treatment lifecycle.
- MainFlow:
  1. Register patient in Patients module.
  2. Book consultation in Appointments with assigned doctor.
  3. Create prescription in Prescriptions and add medication lines (healthplix.prescription -> healthplix.prescription.line).
  4. Create lab report for ordered diagnostics and capture validated result context.
  5. Admit patient in IPD Details, assign ward and bed, and progress treatment.
  6. Complete discharge status in IPD lifecycle.
  7. Generate consolidated billing in Billing from relevant care events and verify totals.
- AlternateOrExceptionFlow:
  1. If any step references wrong patient context, system must prevent cross-patient linkage.
  2. If medication line quantity is invalid or clinical conflict exists, prescription confirmation must be blocked.
  3. If lab report required fields are missing or values invalid, report save must be blocked/flagged.
  4. If occupied bed is selected, IPD assignment must fail safely.
  5. If duplicate/negative billing lines are added, billing finalization must be blocked.
- ExpectedOutcome: End-to-end patient journey is completed with safe validation, consistent data linkage, and accurate final billing.
- RiskIfFailed: Workflow breakage can produce unsafe treatment decisions, admission/billing errors, and compromised care continuity.
- SeverityIfFailed: Critical
- Priority: P0
