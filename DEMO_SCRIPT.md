# CureUs 5-Minute Demo Script

## 0. Login

- Open CureUs.
- Click Login.
- Select the Patient account:
  - `patient@cureus.local`
  - `patient123`
- Login.

Talk track:

> CureUs now uses a real local Node auth server. Passwords are hashed, sessions use signed bearer tokens, and views are role-aware.

## 1. Ask "What is PCOS?"

- Open Patient Chat.
- Click or type: `What is PCOS?`
- Show:
  - RAG answer
  - citations
  - trust score
  - RAG reasoning panel
  - agent trace
  - disclaimer

Talk track:

> CureUs is not answering from model memory. The MVP simulates retrieval over curated medical documents and shows why sources were selected.

## 2. Ask "I have chest pain and sweating"

- Type: `I have chest pain and sweating`
- Show:
  - Risk Level: Emergency
  - urgent warning
  - normal casual answer blocked
  - triage reason
  - flagged case added to doctor review queue
  - admin audit log created

Talk track:

> This is the safety highlight. Emergency triage runs before normal RAG, so the app does not provide casual advice for potentially urgent symptoms.

## 3. Ask "I have acne and hair fall"

- Type: `I have acne and hair fall`
- Show:
  - Dermatologist routing
  - urgency
  - reason
  - sources used
  - Request Appointment button
- Click Request Appointment.
- Fill:
  - Name: Demo Patient
  - Age: 24
  - Preferred specialist: Dermatologist
  - Concern: Acne and hair fall for 6 weeks
- Submit.

Talk track:

> CureUs routes the user to the right expert and writes an appointment request only after confirmation.

## 4. Use sample blood report

- Open Report Upload.
- Click Use Sample Blood Report without consent first.
- Show consent gate.
- Check consent:
  - `I consent to CureUs processing this report for AI-assisted explanation.`
- Click Use Sample Blood Report again.
- Show:
  - Hemoglobin: 10.2 g/dL - Low
  - Vitamin D: 14 ng/mL - Low
  - HbA1c: 6.1% - Slightly High
  - TSH: 2.3 - Normal
  - simple meaning
  - what to discuss with doctor
  - no diagnosis disclaimer
- Click Send to doctor for review.

Talk track:

> Report explanation is consent-gated and avoids diagnosis. It prepares a doctor-reviewable summary.

## 5. Open doctor dashboard

- Switch User / Login as Doctor:
  - `doctor@cureus.local`
  - `doctor123`
- Open Doctor Dashboard.
- Show:
  - Today's appointment requests
  - AI review queue
  - Flagged emergency cases
  - Report summaries
- Click Approve, Edit, Reject, or Mark as Reviewed on a queue item.
- Show status update in UI.

Talk track:

> Doctors remain in the loop. They can approve, edit, reject, or mark AI summaries as reviewed.

## 6. Open admin dashboard

- Switch User / Login as Admin:
  - `admin@cureus.local`
  - `admin123`
- Open Admin Dashboard.
- Show:
  - verified sources
  - source active/inactive toggle
  - flagged emergency conversations
  - doctor verification list
  - audit logs
- Toggle one source active/inactive.
- Show audit log updated.

Talk track:

> Admins can monitor source governance, flagged conversations, doctor verification, and safety events.

## Close

> CureUs demonstrates the full story: user asks health query -> AI detects risk -> RAG gives cited answer -> specialist is routed -> doctor reviews -> admin monitors safety.
