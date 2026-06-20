import React, { useEffect, useMemo, useState } from "react";
import { medicalSources as seedSources } from "./data/medicalSources.js";
import { mockDoctors } from "./data/mockDoctors.js";
import { generateRagResponse } from "./utils/ragEngine.js";

const DISCLAIMER =
  "CureUs provides general health information only. It does not diagnose, prescribe, or replace emergency medical care.";

const demoPrompts = [
  "What is PCOS?",
  "I have chest pain and sweating",
  "I have acne and hair fall"
];

const initialAuditLogs = [
  { id: "audit-1", message: "Curated medical sources loaded", time: "Demo start" },
  { id: "audit-2", message: "Safety rules enabled: no diagnosis, no prescription, emergency escalation", time: "Demo start" }
];

function loadState(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function App() {
  const [view, setView] = useState("landing");
  const [sources, setSources] = useState(() => loadState("cureus.sources", seedSources));
  const [messages, setMessages] = useState(() => loadState("cureus.messages", []));
  const [appointments, setAppointments] = useState(() => loadState("cureus.appointments", []));
  const [reviewQueue, setReviewQueue] = useState(() => loadState("cureus.reviewQueue", []));
  const [flaggedCases, setFlaggedCases] = useState(() => loadState("cureus.flaggedCases", []));
  const [auditLogs, setAuditLogs] = useState(() => loadState("cureus.auditLogs", initialAuditLogs));
  const [doctorTab, setDoctorTab] = useState("appointments");
  const [chatInput, setChatInput] = useState("");
  const [appointmentDraft, setAppointmentDraft] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [reportConsent, setReportConsent] = useState(false);
  const [reportSummary, setReportSummary] = useState(null);
  const [selectedFile, setSelectedFile] = useState("");

  useEffect(() => localStorage.setItem("cureus.sources", JSON.stringify(sources)), [sources]);
  useEffect(() => localStorage.setItem("cureus.messages", JSON.stringify(messages)), [messages]);
  useEffect(() => localStorage.setItem("cureus.appointments", JSON.stringify(appointments)), [appointments]);
  useEffect(() => localStorage.setItem("cureus.reviewQueue", JSON.stringify(reviewQueue)), [reviewQueue]);
  useEffect(() => localStorage.setItem("cureus.flaggedCases", JSON.stringify(flaggedCases)), [flaggedCases]);
  useEffect(() => localStorage.setItem("cureus.auditLogs", JSON.stringify(auditLogs)), [auditLogs]);

  const latestAnswer = [...messages].reverse().find((message) => message.role === "assistant")?.payload;

  const stats = useMemo(
    () => ({
      activeSources: sources.filter((source) => source.active !== false).length,
      flagged: flaggedCases.length,
      appointments: appointments.length,
      pendingReviews: reviewQueue.filter((item) => item.status !== "Reviewed").length
    }),
    [sources, flaggedCases, appointments, reviewQueue]
  );

  function addAudit(message) {
    setAuditLogs((logs) => [
      { id: crypto.randomUUID(), message, time: new Date().toLocaleString() },
      ...logs
    ]);
  }

  function submitChat(queryText = chatInput) {
    const query = queryText.trim();
    if (!query) return;

    const response = generateRagResponse(query, sources);
    const userMessage = { id: crypto.randomUUID(), role: "user", text: query };
    const assistantMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: response.answer,
      payload: response
    };

    setMessages((items) => [...items, userMessage, assistantMessage]);
    setChatInput("");
    addAudit(`Patient query processed: "${query}"`);

    if (response.triage.riskLevel === "Emergency") {
      const flagged = {
        id: crypto.randomUUID(),
        patient: "Patient-CU-1042",
        query,
        riskLevel: "Emergency",
        reason: response.triage.reason,
        sources: response.sources.map((source) => source.title),
        trustScore: response.trustScore,
        status: "Escalated"
      };
      setFlaggedCases((items) => [flagged, ...items]);
      setReviewQueue((items) => [
        {
          id: crypto.randomUUID(),
          type: "Emergency conversation",
          patient: flagged.patient,
          summary: response.answer,
          query,
          riskLevel: "Emergency",
          specialist: response.route.specialist,
          sources: flagged.sources,
          trustScore: response.trustScore,
          status: "Needs doctor review"
        },
        ...items
      ]);
      addAudit("Emergency query flagged and added to doctor review queue");
    }
  }

  function openAppointment(payload) {
    setAppointmentDraft({
      name: "",
      age: "",
      specialist: payload?.route?.specialist || "General Physician",
      concern: payload?.query || ""
    });
  }

  function submitAppointment(event) {
    event.preventDefault();
    const appointment = {
      id: crypto.randomUUID(),
      patient: appointmentDraft.name || "Demo Patient",
      age: appointmentDraft.age || "Not provided",
      specialist: appointmentDraft.specialist,
      concern: appointmentDraft.concern,
      status: "Requested",
      requestedAt: new Date().toLocaleString()
    };
    setAppointments((items) => [appointment, ...items]);
    setAppointmentDraft(null);
    setSuccessMessage("Appointment request sent to doctor dashboard.");
    addAudit("Appointment requested");
    setDoctorTab("appointments");
  }

  function generateReportSummary(useSample = false) {
    if (!reportConsent) {
      setReportSummary({
        blocked: true,
        title: "Consent required",
        text: "Please provide consent before CureUs processes a report for AI-assisted explanation."
      });
      return;
    }

    const labSource = sources.find((source) => source.id === "lab-report-guide");
    setReportSummary({
      blocked: false,
      title: useSample ? "Sample Blood Report" : selectedFile || "Uploaded Report",
      values: [
        { label: "Hemoglobin", value: "10.2 g/dL", status: "Low" },
        { label: "Vitamin D", value: "14 ng/mL", status: "Low" },
        { label: "HbA1c", value: "6.1%", status: "Slightly High" },
        { label: "TSH", value: "2.3", status: "Normal" }
      ],
      meaning:
        "Some values are outside the reference range shown in the sample report. This can guide a doctor discussion, but it is not a diagnosis.",
      doctorDiscussion:
        "Discuss low hemoglobin, low vitamin D, and slightly high HbA1c with a doctor, especially if symptoms, medications, diet, or medical history are relevant.",
      source: labSource
    });
    addAudit("Report processed after consent");
  }

  function sendReportToDoctor() {
    if (!reportSummary || reportSummary.blocked) return;
    setReviewQueue((items) => [
      {
        id: crypto.randomUUID(),
        type: "Report summary",
        patient: "Patient-CU-2048",
        summary: `${reportSummary.title}: ${reportSummary.meaning}`,
        query: "Blood report explanation",
        riskLevel: "Medium",
        specialist: "General Physician / Endocrinologist",
        sources: [reportSummary.source?.title || "Blood Report Patient Explanation Guide"],
        trustScore: 88,
        status: "Needs doctor review"
      },
      ...items
    ]);
    setSuccessMessage("Report summary sent to doctor review queue.");
    addAudit("Report sent for review");
    setDoctorTab("reports");
  }

  function updateReviewStatus(id, status) {
    setReviewQueue((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
    addAudit(`Doctor reviewed AI summary: ${status}`);
  }

  function toggleSource(id) {
    setSources((items) =>
      items.map((source) => (source.id === id ? { ...source, active: source.active === false } : source))
    );
    addAudit("RAG source active status changed");
  }

  function resetDemo() {
    localStorage.clear();
    setSources(seedSources);
    setMessages([]);
    setAppointments([]);
    setReviewQueue([]);
    setFlaggedCases([]);
    setAuditLogs(initialAuditLogs);
    setReportSummary(null);
    setSuccessMessage("Demo state reset.");
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">+</div>
          <div>
            <strong>CureUs</strong>
            <span>Safe healthcare AI MVP</span>
          </div>
        </div>
        <nav>
          {[
            ["landing", "Landing"],
            ["chat", "Patient Chat"],
            ["report", "Report Upload"],
            ["doctor", "Doctor Dashboard"],
            ["admin", "Admin Dashboard"]
          ].map(([key, label]) => (
            <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)} type="button">
              {label}
            </button>
          ))}
        </nav>
        <div className="safetyBox">
          <strong>Safety rules</strong>
          <span>No diagnosis</span>
          <span>No prescription</span>
          <span>Emergency escalation</span>
          <span>Consent before reports</span>
        </div>
        <button className="ghostButton" onClick={resetDemo} type="button">Reset demo state</button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">RAG + Agentic AI healthcare prototype</p>
            <h1>CureUs</h1>
          </div>
          <div className="topStats">
            <Metric label="Active sources" value={stats.activeSources} />
            <Metric label="Flagged" value={stats.flagged} />
            <Metric label="Appointments" value={stats.appointments} />
            <Metric label="Pending reviews" value={stats.pendingReviews} />
          </div>
        </header>

        {successMessage && (
          <div className="toast">
            <span>{successMessage}</span>
            <button type="button" onClick={() => setSuccessMessage("")}>Dismiss</button>
          </div>
        )}

        {view === "landing" && (
          <Landing
            setView={setView}
            submitChat={submitChat}
          />
        )}

        {view === "chat" && (
          <ChatView
            messages={messages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            submitChat={submitChat}
            latestAnswer={latestAnswer}
            openAppointment={openAppointment}
          />
        )}

        {view === "report" && (
          <ReportView
            reportConsent={reportConsent}
            setReportConsent={setReportConsent}
            selectedFile={selectedFile}
            setSelectedFile={setSelectedFile}
            reportSummary={reportSummary}
            generateReportSummary={generateReportSummary}
            sendReportToDoctor={sendReportToDoctor}
          />
        )}

        {view === "doctor" && (
          <DoctorDashboard
            tab={doctorTab}
            setTab={setDoctorTab}
            appointments={appointments}
            reviewQueue={reviewQueue}
            flaggedCases={flaggedCases}
            updateReviewStatus={updateReviewStatus}
          />
        )}

        {view === "admin" && (
          <AdminDashboard
            sources={sources}
            toggleSource={toggleSource}
            flaggedCases={flaggedCases}
            reviewQueue={reviewQueue}
            auditLogs={auditLogs}
          />
        )}

        <footer>{DISCLAIMER}</footer>
      </main>

      {appointmentDraft && (
        <AppointmentModal
          draft={appointmentDraft}
          setDraft={setAppointmentDraft}
          onClose={() => setAppointmentDraft(null)}
          onSubmit={submitAppointment}
        />
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Landing({ setView, submitChat }) {
  return (
    <section className="landing">
      <div className="hero">
        <div>
          <p className="eyebrow">AI-Powered Healthcare Expertise Platform</p>
          <h2>Safe AI healthcare guidance with RAG, emergency triage, expert routing, and doctor-in-the-loop review.</h2>
          <p>
            CureUs demonstrates how a healthcare assistant can answer from curated sources, detect urgent cases before normal chat, route users to the right expert, and keep doctors in control.
          </p>
          <div className="buttonRow">
            <button className="primaryButton" onClick={() => setView("chat")} type="button">Try Patient Chat</button>
            <button className="secondaryButton" onClick={() => setView("doctor")} type="button">View Doctor Dashboard</button>
            <button className="secondaryButton" onClick={() => setView("admin")} type="button">View Admin Dashboard</button>
          </div>
        </div>
        <div className="storyCard">
          <strong>Demo story</strong>
          <span>User asks health query</span>
          <span>AI detects risk</span>
          <span>RAG gives cited answer</span>
          <span>Specialist is routed</span>
          <span>Doctor reviews</span>
          <span>Admin monitors safety</span>
        </div>
      </div>

      <div className="featureGrid">
        {[
          ["Emergency Triage Agent", "Blocks casual advice for red-flag symptoms and escalates urgent care."],
          ["Verified RAG Answers", "Retrieves mock curated sources, citations, confidence, and trust score."],
          ["Specialist Routing", "Maps symptoms to dermatologist, gynecologist, cardiologist, therapist, and more."],
          ["Doctor Review", "Lets doctors approve, edit, reject, and mark AI summaries as reviewed."]
        ].map(([title, text]) => (
          <article className="featureCard" key={title}>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>

      <div className="quickDemo">
        <h3>One-click judge demos</h3>
        <div className="buttonRow">
          {demoPrompts.map((prompt) => (
            <button
              key={prompt}
              className="chipButton"
              onClick={() => {
                setView("chat");
                setTimeout(() => submitChat(prompt), 0);
              }}
              type="button"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function ChatView({ messages, chatInput, setChatInput, submitChat, latestAnswer, openAppointment }) {
  return (
    <section className="gridTwo">
      <div className="panel chatPanel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Patient AI Chat</p>
            <h2>Ask a health question</h2>
          </div>
          <RiskBadge risk={latestAnswer?.triage.riskLevel || "Awaiting query"} />
        </div>

        <div className="demoPrompts">
          {demoPrompts.map((prompt) => (
            <button key={prompt} onClick={() => submitChat(prompt)} type="button">
              {prompt}
            </button>
          ))}
        </div>

        <div className="chatWindow">
          {!messages.length && (
            <div className="emptyState">
              Try “What is PCOS?”, “I have chest pain and sweating”, or “I have acne and hair fall”.
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`message ${message.role}`}>
              <span className="avatar">{message.role === "user" ? "You" : "AI"}</span>
              <div className="bubble">
                {message.role === "assistant" && message.payload ? (
                  <AnswerCard payload={message.payload} openAppointment={openAppointment} />
                ) : (
                  <p>{message.text}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <form className="composer" onSubmit={(event) => { event.preventDefault(); submitChat(); }}>
          <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Type your health question..." />
          <button className="primaryButton" type="submit">Ask CureUs</button>
        </form>
      </div>

      <aside className="panel">
        <h3>RAG Reasoning</h3>
        {latestAnswer ? <ReasoningPanel payload={latestAnswer} /> : <p className="muted">Submit a query to see retrieval reasoning.</p>}
        <h3>Agent Flow</h3>
        {latestAnswer ? <AgentTrace trace={latestAnswer.trace} /> : <p className="muted">Agent trace appears after an answer.</p>}
      </aside>
    </section>
  );
}

function AnswerCard({ payload, openAppointment }) {
  const showAppointment = payload.triage.riskLevel !== "Emergency" && payload.route.specialist !== "General Physician";
  return (
    <div className="answerCard">
      <div className="answerMeta">
        <InfoTile label="Risk level" value={payload.triage.riskLevel} />
        <InfoTile label="Trust score" value={`${payload.trustScore}%`} />
        <InfoTile label="Specialist" value={payload.route.specialist} />
      </div>
      <p className={payload.triage.riskLevel === "Emergency" ? "emergencyText" : ""}>{payload.answer}</p>
      {payload.triage.riskLevel === "Emergency" && <p className="blockedText">Normal casual medical advice blocked by Safety Critic Agent.</p>}
      <div className="sourceList">
        <h4>Sources used</h4>
        {payload.sources.map((source) => (
          <SourceCard key={source.id} source={source} />
        ))}
      </div>
      {showAppointment && (
        <button className="primaryButton" onClick={() => openAppointment(payload)} type="button">Request Appointment</button>
      )}
      <p className="disclaimer">{payload.disclaimer}</p>
    </div>
  );
}

function ReasoningPanel({ payload }) {
  return (
    <div className="reasoning">
      <InfoTile label="Matched keywords" value={payload.matchedKeywords.length ? payload.matchedKeywords.join(", ") : "Safety fallback"} />
      <InfoTile label="Confidence / Trust" value={`${payload.trustScore}%`} />
      <InfoTile label="Triage reason" value={payload.triage.reason} />
      <div>
        <strong>Why sources were selected</strong>
        <ul>
          {payload.sources.map((source) => (
            <li key={source.id}>{source.title}: {source.selectionReason || "High authority safety source."}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AgentTrace({ trace }) {
  return (
    <ol className="agentTrace">
      {trace.map((step) => (
        <li key={step.name} className={step.status}>
          <strong>{step.name}</strong>
          <span>{step.status}</span>
          <p>{step.detail}</p>
        </li>
      ))}
    </ol>
  );
}

function ReportView({ reportConsent, setReportConsent, selectedFile, setSelectedFile, reportSummary, generateReportSummary, sendReportToDoctor }) {
  return (
    <section className="gridTwo">
      <div className="panel">
        <p className="eyebrow">Report Upload + Consent Gate</p>
        <h2>Explain a medical report safely</h2>
        <label className="uploadBox">
          <span>Upload report file</span>
          <input
            type="file"
            onChange={(event) => setSelectedFile(event.target.files[0]?.name || "")}
          />
          <small>{selectedFile || "No file selected"}</small>
        </label>
        <label className="checkRow">
          <input type="checkbox" checked={reportConsent} onChange={(event) => setReportConsent(event.target.checked)} />
          <span>I consent to CureUs processing this report for AI-assisted explanation.</span>
        </label>
        <div className="buttonRow">
          <button className="primaryButton" onClick={() => generateReportSummary(false)} type="button">Explain Uploaded Report</button>
          <button className="secondaryButton" onClick={() => generateReportSummary(true)} type="button">Use Sample Blood Report</button>
        </div>
      </div>

      <div className="panel">
        <h3>Report explanation</h3>
        {!reportSummary && <p className="muted">Consent is required before any AI-assisted explanation appears.</p>}
        {reportSummary?.blocked && <p className="emergencyText">{reportSummary.text}</p>}
        {reportSummary && !reportSummary.blocked && (
          <div className="reportResult">
            <h3>{reportSummary.title}</h3>
            <div className="valueGrid">
              {reportSummary.values.map((item) => (
                <InfoTile key={item.label} label={item.label} value={`${item.value} - ${item.status}`} />
              ))}
            </div>
            <h4>Simple meaning</h4>
            <p>{reportSummary.meaning}</p>
            <h4>What to discuss with doctor</h4>
            <p>{reportSummary.doctorDiscussion}</p>
            <h4>Sources used</h4>
            {reportSummary.source && <SourceCard source={reportSummary.source} />}
            <p className="disclaimer">No diagnosis is made from this report. A doctor should interpret results with symptoms, history, and medications.</p>
            <button className="primaryButton" onClick={sendReportToDoctor} type="button">Send to doctor for review</button>
          </div>
        )}
      </div>
    </section>
  );
}

function DoctorDashboard({ tab, setTab, appointments, reviewQueue, flaggedCases, updateReviewStatus }) {
  const reportItems = reviewQueue.filter((item) => item.type === "Report summary");
  const tabs = [
    ["appointments", `Today's appointment requests (${appointments.length})`],
    ["reviews", `AI review queue (${reviewQueue.length})`],
    ["flagged", `Flagged emergency cases (${flaggedCases.length})`],
    ["reports", `Report summaries (${reportItems.length})`]
  ];

  return (
    <section className="panel">
      <p className="eyebrow">Doctor Dashboard</p>
      <h2>Doctor-in-the-loop review</h2>
      <div className="tabs">
        {tabs.map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)} type="button">{label}</button>
        ))}
      </div>

      {tab === "appointments" && (
        <CardGrid empty="No appointment requests yet. Use specialist routing to create one.">
          {appointments.map((item) => (
            <article className="caseCard" key={item.id}>
              <h3>{item.patient}</h3>
              <p>{item.concern}</p>
              <InfoTile label="Age" value={item.age} />
              <InfoTile label="Specialist" value={item.specialist} />
              <StatusBadge status={item.status} />
            </article>
          ))}
        </CardGrid>
      )}

      {tab === "reviews" && (
        <CardGrid empty="No AI review queue items yet.">
          {reviewQueue.map((item) => (
            <ReviewCard key={item.id} item={item} updateReviewStatus={updateReviewStatus} />
          ))}
        </CardGrid>
      )}

      {tab === "flagged" && (
        <CardGrid empty="No emergency cases flagged yet.">
          {flaggedCases.map((item) => (
            <article className="caseCard emergencyBorder" key={item.id}>
              <h3>{item.patient}</h3>
              <p>{item.query}</p>
              <p>{item.reason}</p>
              <RiskBadge risk={item.riskLevel} />
              <InfoTile label="Trust score" value={`${item.trustScore}%`} />
            </article>
          ))}
        </CardGrid>
      )}

      {tab === "reports" && (
        <CardGrid empty="No report summaries sent yet.">
          {reportItems.map((item) => (
            <ReviewCard key={item.id} item={item} updateReviewStatus={updateReviewStatus} />
          ))}
        </CardGrid>
      )}
    </section>
  );
}

function ReviewCard({ item, updateReviewStatus }) {
  return (
    <article className="caseCard">
      <h3>{item.type}</h3>
      <p><strong>Patient:</strong> {item.patient}</p>
      <p><strong>Query/report:</strong> {item.query}</p>
      <p><strong>AI summary:</strong> {item.summary}</p>
      <div className="miniGrid">
        <RiskBadge risk={item.riskLevel} />
        <InfoTile label="Specialist" value={item.specialist} />
        <InfoTile label="Trust score" value={`${item.trustScore}%`} />
      </div>
      <h4>Sources used</h4>
      <ul>{item.sources.map((source) => <li key={source}>{source}</li>)}</ul>
      <StatusBadge status={item.status} />
      <div className="buttonRow">
        <button className="miniButton approve" onClick={() => updateReviewStatus(item.id, "Approved")} type="button">Approve</button>
        <button className="miniButton" onClick={() => updateReviewStatus(item.id, "Edited by doctor")} type="button">Edit</button>
        <button className="miniButton reject" onClick={() => updateReviewStatus(item.id, "Rejected")} type="button">Reject</button>
        <button className="miniButton" onClick={() => updateReviewStatus(item.id, "Reviewed")} type="button">Mark as Reviewed</button>
      </div>
    </article>
  );
}

function AdminDashboard({ sources, toggleSource, flaggedCases, reviewQueue, auditLogs }) {
  return (
    <section className="adminGrid">
      <div className="panel">
        <p className="eyebrow">Admin Dashboard</p>
        <h2>RAG source governance</h2>
        <div className="sourceTable">
          {sources.map((source) => (
            <article className="sourceRow" key={source.id}>
              <div>
                <h3>{source.title}</h3>
                <p>{source.sourceName} | {source.specialty} | Evidence: {source.evidenceLevel}</p>
                <small>Reviewed by {source.reviewedBy} on {source.lastReviewed}</small>
              </div>
              <button className={source.active === false ? "inactiveToggle" : "activeToggle"} onClick={() => toggleSource(source.id)} type="button">
                {source.active === false ? "Inactive" : "Active"}
              </button>
            </article>
          ))}
        </div>
      </div>

      <aside className="panel">
        <h3>Flagged conversations</h3>
        {flaggedCases.length ? flaggedCases.map((item) => (
          <div className="compactCard" key={item.id}>
            <strong>{item.riskLevel}</strong>
            <p>{item.query}</p>
          </div>
        )) : <p className="muted">No flagged emergency cases yet.</p>}

        <h3>Doctor verification list</h3>
        {reviewQueue.slice(0, 4).map((item) => (
          <div className="compactCard" key={item.id}>
            <strong>{item.status}</strong>
            <p>{item.type}: {item.patient}</p>
          </div>
        ))}

        <h3>Audit logs</h3>
        <div className="auditList">
          {auditLogs.map((log) => (
            <div key={log.id}>
              <strong>{log.message}</strong>
              <span>{log.time}</span>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}

function AppointmentModal({ draft, setDraft, onClose, onSubmit }) {
  return (
    <div className="modalBackdrop">
      <form className="modal" onSubmit={onSubmit}>
        <h2>Request appointment</h2>
        <label>Name
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Demo Patient" />
        </label>
        <label>Age
          <input value={draft.age} onChange={(event) => setDraft({ ...draft, age: event.target.value })} placeholder="28" />
        </label>
        <label>Preferred specialist
          <input value={draft.specialist} onChange={(event) => setDraft({ ...draft, specialist: event.target.value })} />
        </label>
        <label>Concern summary
          <textarea value={draft.concern} onChange={(event) => setDraft({ ...draft, concern: event.target.value })} />
        </label>
        <div className="buttonRow">
          <button className="primaryButton" type="submit">Submit request</button>
          <button className="secondaryButton" onClick={onClose} type="button">Cancel</button>
        </div>
      </form>
    </div>
  );
}

function CardGrid({ children, empty }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  if (!items || (Array.isArray(items) && !items.length)) return <p className="emptyState">{empty}</p>;
  return <div className="cardGrid">{items}</div>;
}

function InfoTile({ label, value }) {
  return (
    <div className="infoTile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RiskBadge({ risk }) {
  const className = risk === "Emergency" ? "risk emergency" : risk === "Medium" ? "risk medium" : "risk low";
  return <span className={className}>{risk}</span>;
}

function StatusBadge({ status }) {
  return <span className="statusBadge">{status}</span>;
}

function SourceCard({ source }) {
  return (
    <article className="sourceCard">
      <strong>{source.title}</strong>
      <span>{source.sourceName} | {source.specialty}</span>
      <small>Evidence: {source.evidenceLevel} | Reviewed by {source.reviewedBy}</small>
    </article>
  );
}

export default App;
