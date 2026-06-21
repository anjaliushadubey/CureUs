# CureUs

CureUs is not a diagnosis or prescription tool. It is a safe AI healthcare expertise platform with RAG-based answers, emergency triage, specialist routing, report explanation, and doctor-in-the-loop review.

## Problem

People often ask health questions online and receive uncited, overconfident, or unsafe answers. Healthcare AI must be different: it should cite sources, avoid diagnosis and prescriptions, detect emergencies before normal chat, protect consent, and keep clinicians in the loop.

## Solution

CureUs is a working hackathon MVP that demonstrates a safer healthcare AI product flow:

- Patient asks a question in chat.
- Triage Agent classifies risk.
- Simulated RAG retrieves curated medical sources.
- Safety Critic enforces no diagnosis, no prescription, and emergency escalation.
- Specialist Routing Agent recommends the right expert.
- Appointment requests and report summaries flow into the doctor dashboard.
- Admin dashboard monitors sources, flagged cases, audit logs, and governance.

## Features

- Landing page with demo story and CTAs
- Real local login/signup with a Node auth API
- PBKDF2 password hashing and signed bearer tokens
- Role-aware access for Patient, Doctor, and Admin views
- Working patient AI chat
- Emergency red-flag triage
- Simulated RAG with citations, matched keywords, reasoning, and trust score
- Specialist routing with appointment request modal
- Report upload simulation with consent gate
- Sample blood report explanation
- Doctor dashboard with appointments, AI review queue, flagged cases, and reports
- Doctor actions: Approve, Edit, Reject, Mark as Reviewed
- Admin dashboard with source active/inactive toggles
- Local audit logs
- `localStorage` persistence for demo state

## Architecture

```text
React + Vite frontend
  -> Local Node auth server
  -> Password hashing + signed token session
  -> Local mock medical source data
  -> Triage utility
  -> Simulated RAG retrieval utility
  -> Specialist routing utility
  -> React state + localStorage
  -> Patient, Doctor, and Admin views
```

## Agent Workflow

```text
User Query
  -> Triage Agent
  -> RAG Retrieval Agent
  -> Safety Critic Agent
  -> Specialist Routing Agent
  -> Doctor Review Queue if needed
```

Each chat response shows an agent trace with step status:

- completed
- skipped
- escalated

## RAG Simulation

Current MVP uses simulated RAG over curated mock medical documents. Production version will use PostgreSQL + pgvector/vector DB, hybrid retrieval, reranking, and verified medical knowledge ingestion.

The local RAG engine:

- Matches query keywords against `condition`, `content`, and `specialty`
- Returns top 3 active sources
- Shows matched keywords
- Shows why sources were selected
- Calculates a visible Trust Score

Trust Score logic:

- Base score 50
- +15 if 2 or more sources found
- +10 if a high evidence source is found
- +10 if a doctor-reviewed source is found
- -20 if query contains personal symptom words
- -30 if emergency risk
- Clamp between 10 and 98

## Safety Design

CureUs visibly enforces:

- No diagnosis
- No prescription
- Emergency escalation
- Doctor-in-the-loop review
- Citation-based answers
- Consent before report processing

Disclaimer shown in the app:

> CureUs provides general health information only. It does not diagnose, prescribe, or replace emergency medical care.

## Tech Stack

- React
- Vite
- Node.js local auth API
- PBKDF2 password hashing
- Signed bearer tokens
- Plain CSS
- Local mock data
- Browser `localStorage`
- Local JSON auth store
- No real API keys

## How To Run

```powershell
npm install
npm run dev
```

`npm run dev` starts both:

- Auth API: `http://127.0.0.1:4000`
- Frontend: `http://127.0.0.1:5173`

Then open:

```text
http://127.0.0.1:5173/
```

Seeded accounts:

```text
Patient: patient@cureus.local / patient123
Doctor:  doctor@cureus.local / doctor123
Admin:   admin@cureus.local / admin123
```

New signups create Patient accounts.

## Demo Flow

1. Open Landing and show the CureUs positioning.
2. Login as Patient.
3. Click Try Patient Chat.
4. Ask `What is PCOS?` and show RAG answer, citations, trust score, and agent trace.
5. Ask `I have chest pain and sweating` and show emergency triage with normal answer blocked.
6. Ask `I have acne and hair fall` and request an appointment.
7. Open Report Upload, consent, and use the sample blood report.
8. Send report summary to doctor review.
9. Switch/login as Doctor and update a case status.
10. Switch/login as Admin, toggle a source active/inactive, and show audit logs.

## Limitations

- RAG is simulated with local keyword matching.
- Sources are curated mock documents, not live medical guidelines.
- Authentication is local development auth, not production identity management.
- RBAC is enforced in the frontend for demo routing; production must enforce authorization on the backend too.
- No real file OCR.
- No real appointment booking.
- No production compliance layer.

## Future Scope

- Next.js production frontend
- FastAPI backend
- PostgreSQL + pgvector
- Hybrid retrieval with BM25 + vector search
- Reranking
- Verified medical knowledge ingestion workflow
- Doctor verification workflow with real accounts
- Secure object storage for reports
- PHI redaction and audit logging backend
- FHIR-ready EHR integration
- Hindi + English support
