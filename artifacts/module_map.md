# Module Map

GeneratedAt: 2026-07-11T18:32:32.853Z
BaseURL: https://team43.qaaerp.com

| Module | MenuPath | ActionRef | ColumnsCount | FieldsCount |
|---|---|---|---:|---:|
| Patients | Patients | action-374 | 5 | 17 |
| Doctors | Doctors | action-375 | 4 | 7 |
| Prescriptions | Prescriptions | action-377 | 4 | 7 |
| Lab Reports | Lab Reports | action-378 | 7 | 13 |
| IPD Details | IPD Details | action-380 | 12 | 21 |
| Appointments | Appointments | action-376 | 7 | 21 |
| Billing | Billings | action-383 | 5 | 10 |
| Ward Management | Dashboard card > Ward Management | action-381 | 5 | 6 |
| Bed Management | Dashboard card > Bed Management | action-382 | 5 | 6 |

## Patients
- MenuPath: Patients
- ActionRef: action-374
- ActionURL: https://team43.qaaerp.com/odoo/action-372/action-374
- Columns (5): Patient UHID, Name, Phone, Email, Related Doctors
- Form Fields (17):
  - address — "Address" (required: no)
  - blood_type — "Blood Type" (required: no)
  - dob — "Date of Birth" (required: no)
  - email — "Email" (required: no)
  - gender — "Gender" (required: no)
  - identity_document_attachment — "Gender" (required: no)
  - identity_document_attachment_filename — "Attachment Filename" (required: no)
  - identity_document_number — "ID Document Number" (required: no)
  - identity_document_type — "ID Document Type" (required: no)
  - image — "Photo" (required: no)
  - name (required: yes)
  - partner_id — "Gender" (required: no)
  - phone — "Phone" (required: no)
  - prescription_header_ids (required: no)
  - referred_by — "Referred By?" (required: no)
  - related_doctor_ids — "Gender" (required: no)
  - uid (required: no)

## Doctors
- MenuPath: Doctors
- ActionRef: action-375
- ActionURL: https://team43.qaaerp.com/odoo/action-372/action-375
- Columns (4): Name, Specialization, Experience (Years), Phone
- Form Fields (7):
  - address — "Address" (required: no)
  - email — "Email" (required: no)
  - experience — "Experience (Years)" (required: no)
  - image — "Photo" (required: no)
  - name — "Name" (required: yes)
  - phone — "Phone" (required: no)
  - specialization — "Specialization" (required: no)

## Prescriptions
- MenuPath: Prescriptions
- ActionRef: action-377
- ActionURL: https://team43.qaaerp.com/odoo/action-372/action-377
- Columns (4): Reference, Patient, Appointment, Date
- Form Fields (7):
  - appointment_id — "Appointment" (required: no)
  - date — "Date" (required: no)
  - name (required: yes)
  - notes (required: no)
  - patient_id — "Patient" (required: yes)
  - prescription_line_ids (required: no)
  - product_id (required: yes)

## Lab Reports
- MenuPath: Lab Reports
- ActionRef: action-378
- ActionURL: https://team43.qaaerp.com/odoo/action-372/action-378
- Columns (7): Ref, Patient, Date, Test Type, Doctor, Lab, Status
- Form Fields (13):
  - date — "Patient" (required: yes)
  - diagnosis — "Diagnosis / Remarks" (required: no)
  - lab_cost — "Lab Cost" (required: no)
  - lab_name — "Lab Name" (required: no)
  - line_ids (required: no)
  - name (required: yes)
  - patient_id — "Patient" (required: yes)
  - referred_by — "Doctor" (required: no)
  - report_image — "Report Image" (required: no)
  - report_pdf — "Report PDF" (required: no)
  - report_pdf_filename — "PDF File" (required: no)
  - state (required: no)
  - test_type_id — "Test Type" (required: no)

## IPD Details
- MenuPath: IPD Details
- ActionRef: action-380
- ActionURL: https://team43.qaaerp.com/odoo/action-372/action-380
- Columns (12): IPD Ref, Patient, Doctor Incharge, Ward, Bed, Admission Date, Discharge Date, Days, Bed Cost, Extra Charges, Total Cost, Status
- Form Fields (21):
  - admission_date — "Admission Date" (required: no)
  - bed_charge_per_day — "Charge / Day" (required: no)
  - bed_id — "Bed" (required: no)
  - days_admitted — "Admission Date" (required: no)
  - discharge_date — "Discharge Date" (required: no)
  - doctor_id — "Doctor Incharge" (required: no)
  - fluid_chart_count (required: no)
  - ipd_cost_line_ids (required: no)
  - ipd_history_count (required: no)
  - patient_id — "Patient" (required: no)
  - preop_checklist_count (required: no)
  - progress_sheet_count (required: no)
  - registration_count (required: no)
  - status (required: no)
  - total_additional_cost — "Bed Charges" (required: no)
  - total_bed_cost — "Charge / Day" (required: no)
  - total_ipd_cost — "Bed Charges" (required: no)
  - treatment_sheet_count (required: no)
  - uid — "IPD Reference" (required: no)
  - vital_chart_count (required: no)
  - ward_id — "Bed" (required: no)

## Appointments
- MenuPath: Appointments
- ActionRef: action-376
- ActionURL: https://team43.qaaerp.com/odoo/action-372/action-376
- Columns (7): Appointment No, Patient, Doctor, Date, Time, Fee, Status
- Form Fields (21):
  - appointment_date — "Appointment No" (required: yes)
  - appointment_time — "Time (HH:MM)?" (required: no)
  - cost — "Consultation Fee" (required: no)
  - doctor_id — "Doctor" (required: yes)
  - name — "Appointment No" (required: no)
  - notes (required: no)
  - patient_address — "Address" (required: no)
  - patient_blood_type — "Blood Type" (required: no)
  - patient_dob — "Date of Birth" (required: no)
  - patient_email — "Email" (required: no)
  - patient_gender — "Gender" (required: no)
  - patient_id — "Patient" (required: no)
  - patient_identity_document_attachment — "ID Document Type" (required: no)
  - patient_identity_document_attachment_filename — "Attachment Filename" (required: no)
  - patient_identity_document_number — "ID Document Number" (required: no)
  - patient_identity_document_type — "ID Document Type" (required: no)
  - patient_image — "Patient Name" (required: no)
  - patient_name — "Patient Name" (required: no)
  - patient_phone — "Phone" (required: no)
  - patient_referred_by — "Referred By" (required: no)
  - state (required: no)

## Billing
- MenuPath: Billings
- ActionRef: action-383
- ActionURL: https://team43.qaaerp.com/odoo/action-372/action-383
- Columns (5): Bill Number, Patient, IPD Reference, Total Amount, Status
- Form Fields (10):
  - bill_no — "Bill Number" (required: no)
  - billing_line_ids (required: no)
  - invoice_amount_due — "Invoice" (required: no)
  - invoice_amount_paid — "Invoice" (required: no)
  - invoice_amount_total — "Invoice" (required: no)
  - invoice_id — "Invoice" (required: no)
  - ipd_id — "IPD Reference" (required: no)
  - patient_id — "Patient" (required: yes)
  - status (required: no)
  - total_amount — "Invoice" (required: no)

## Ward Management
- MenuPath: Dashboard card > Ward Management
- ActionRef: action-381
- ActionURL: https://team43.qaaerp.com/odoo/action-372/action-381
- Columns (5): Ward Name, Ward Code, Ward Type, Floor, Total Beds
- Form Fields (6):
  - bed_ids (required: no)
  - floor — "Floor" (required: no)
  - name — "Ward Name" (required: yes)
  - total_beds — "Floor" (required: no)
  - ward_code — "Ward Code" (required: no)
  - ward_type — "Ward Type" (required: yes)

## Bed Management
- MenuPath: Dashboard card > Bed Management
- ActionRef: action-382
- ActionURL: https://team43.qaaerp.com/odoo/action-372/action-382
- Columns (5): Bed Number, Ward, Bed Type, Status, Bed Charge
- Form Fields (6):
  - bed_number — "Bed Number" (required: yes)
  - bed_type — "Bed Type" (required: no)
  - charge — "Bed Charge" (required: no)
  - notes — "Notes" (required: no)
  - status — "Status" (required: no)
  - ward_id — "Ward" (required: yes)
