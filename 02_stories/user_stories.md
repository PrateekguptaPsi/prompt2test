# User Stories — Oncology HMS (Step 3)

- RequirementID: `REQ-PATIENTS-1`
- Module: `Patients`
- UserStory: `As a registration nurse, I want to register and maintain a unique patient profile, so that all clinical and billing records are linked to the correct patient.`
- Priority: `P0`
- AcceptanceCriteria:
  1. Given I am creating a new patient profile, When I save the record with patient name and demographic details, Then the patient record is created and is available for appointment, prescription, lab, IPD, and billing workflows.
  2. Given an existing patient profile, When I update contact or identity details, Then the updated details are visible in subsequent clinical workflows for that same patient.
  3. Given a patient has related doctors and prior clinical records, When I open the patient profile, Then linked care history is visible and traceable to the same patient.
  4. Given I try to create a patient without a name, When I submit the profile, Then the system prevents save and shows validation that required information is missing.
  5. Given I try to access another patient’s record without valid assignment, When I attempt to open that profile, Then the system prevents unauthorized cross-patient access.

- RequirementID: `REQ-DOCTORS-1`
- Module: `Doctors`
- UserStory: `As a hospital administrator, I want to manage doctor profiles with specialization and availability details, so that appointments and referrals are assigned safely and correctly.`
- Priority: `P1`
- AcceptanceCriteria:
  1. Given I am creating a doctor profile, When I enter name, specialization, and contact details, Then the profile is saved and available for appointment and referral selection.
  2. Given an active doctor profile, When I schedule patient appointments, Then the doctor appears as a selectable provider.
  3. Given doctor information changes, When I update profile details, Then updated details are used in future appointment and lab referral flows.
  4. Given I attempt to save a doctor profile without a name, When I submit, Then the system blocks save and requests required information.
  5. Given a doctor profile is inactive, When users try to assign new care to that doctor, Then the system prevents unsafe assignment.

- RequirementID: `REQ-APPOINTMENTS-1`
- Module: `Appointments`
- UserStory: `As a front-desk coordinator, I want to book appointments with valid patient, doctor, and date details, so that oncology consultations happen on time and with correct clinician assignment.`
- Priority: `P1`
- AcceptanceCriteria:
  1. Given a valid patient and doctor exist, When I create an appointment with date and consultation details, Then the appointment is saved with a generated appointment reference.
  2. Given an appointment exists, When I open it, Then patient and doctor linkage is visible and consistent with source records.
  3. Given I review appointment status, When the consultation progresses, Then status reflects the current clinical workflow stage.
  4. Given I attempt to create an appointment without doctor or appointment date, When I submit, Then the system rejects the request and displays required-field validation.
  5. Given a patient already has a conflicting slot with the same doctor and time, When I attempt to book a duplicate, Then the system prevents double-booking.

- RequirementID: `REQ-PRESCRIPTIONS-1`
- Module: `Prescriptions`
- UserStory: `As an oncologist, I want to create prescriptions linked to the right patient and appointment, so that treatment medication is safe, traceable, and clinically appropriate.`
- Priority: `P0`
- AcceptanceCriteria:
  1. Given a patient encounter is in progress, When I create a prescription for that patient, Then the prescription is saved with unique reference and linked to the patient.
  2. Given a prescription contains multiple medication lines, When I save treatment instructions, Then each line is associated with the same prescription and patient context.
  3. Given medication dosage and duration are entered, When clinical staff review the prescription, Then dosing instructions are clearly available for administration.
  4. Given I attempt to save a prescription without patient linkage, When I submit, Then the system prevents save and indicates required patient selection.
  5. Given a prescription line has zero or negative quantity, When I try to confirm the prescription, Then the system rejects the line to prevent unsafe medication orders.
  6. Given known allergy or interaction risk exists for the selected patient and medication, When I attempt to proceed, Then the system enforces a fail-safe warning/stop before finalizing.

- RequirementID: `REQ-LABREPORTS-1`
- Module: `Lab Reports`
- UserStory: `As a lab clinician, I want to capture and validate lab reports against the correct patient and test context, so that treatment decisions use accurate and safe diagnostic information.`
- Priority: `P0`
- AcceptanceCriteria:
  1. Given a patient requires diagnostics, When I create a lab report with reference, patient, and report date, Then the report is saved and linked to that patient.
  2. Given a doctor referral and test type are selected, When I finalize the report entry, Then referral and test metadata are retained for clinical traceability.
  3. Given report files are attached, When clinicians open the report, Then they can review result evidence associated with the same report record.
  4. Given I attempt to save a lab report without required patient or date details, When I submit, Then the system blocks save and asks for missing required data.
  5. Given test values are outside clinically acceptable range, When results are entered, Then the system flags/blocks unsafe values for validation before acceptance.
  6. Given I attempt to attach or view results under the wrong patient context, When I continue, Then the system prevents cross-patient result assignment.

- RequirementID: `REQ-IPD-1`
- Module: `IPD Details`
- UserStory: `As an IPD care coordinator, I want to manage inpatient admissions, bed assignment, and discharge status, so that inpatient treatment is continuous, safe, and resource-accurate.`
- Priority: `P1`
- AcceptanceCriteria:
  1. Given an admitted patient requires inpatient care, When I create an IPD record and assign doctor, ward, and bed, Then the admission record is created and visible in IPD tracking.
  2. Given an active IPD case, When daily care and costing details are updated, Then total inpatient status and costs remain traceable to the same IPD reference.
  3. Given discharge is completed, When I mark discharge details, Then the IPD status reflects discharge readiness for downstream billing.
  4. Given I attempt to assign a bed that is already occupied, When I save the IPD assignment, Then the system prevents double allocation.
  5. Given a patient is discharged, When I attempt to continue inpatient treatment updates as active, Then the system enforces proper status transition controls.

- RequirementID: `REQ-BILLING-1`
- Module: `Billing`
- UserStory: `As a billing officer, I want to generate patient bills from appointment, lab, prescription, and IPD charge components, so that invoices are accurate and discharge is not delayed by billing errors.`
- Priority: `P1`
- AcceptanceCriteria:
  1. Given a patient has chargeable clinical services, When I create a billing record, Then bill details are linked to the correct patient and relevant care references.
  2. Given billing lines are added for eligible services, When totals are calculated, Then total amount equals the sum of all active bill lines.
  3. Given invoice linkage exists, When payment status changes, Then due, paid, and total amounts stay consistent with invoice state.
  4. Given I attempt to save billing without patient linkage, When I submit, Then the system prevents save and requests required patient selection.
  5. Given a billing line has negative amount or duplicate charge for the same service event, When I attempt to finalize billing, Then the system blocks invalid billing and prevents over/under-charging.

- RequirementID: `REQ-WARD-1`
- Module: `Ward Management`
- UserStory: `As an operations manager, I want to manage wards with capacity and classification details, so that inpatient allocation is planned safely and transparently.`
- Priority: `P2`
- AcceptanceCriteria:
  1. Given I create a ward, When I enter ward name, ward type, and floor details, Then the ward is saved for bed planning and IPD assignment.
  2. Given beds are associated with a ward, When I view ward details, Then bed count and ward occupancy context are visible.
  3. Given ward structure changes, When I update ward metadata, Then subsequent bed and IPD allocations use updated ward details.
  4. Given I attempt to save a ward without required ward name or ward type, When I submit, Then the system rejects save with required-field validation.

- RequirementID: `REQ-BED-1`
- Module: `Bed Management`
- UserStory: `As a bed allocation coordinator, I want to manage bed inventory and status within wards, so that each admitted patient receives a valid and non-conflicting bed assignment.`
- Priority: `P1`
- AcceptanceCriteria:
  1. Given I create a new bed, When I enter bed number and assign a ward, Then the bed is available for IPD allocation.
  2. Given bed status changes due to admission/discharge, When I update bed status, Then current availability is reflected for allocation decisions.
  3. Given bed charges are configured, When IPD billing is prepared, Then bed charge values are available for accurate costing.
  4. Given I attempt to save a bed without bed number or ward assignment, When I submit, Then the system blocks save and highlights missing required details.
  5. Given I attempt to allocate one bed to two active patients, When assignment is processed, Then the system prevents conflicting occupancy and preserves care safety.
