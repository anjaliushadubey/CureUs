import React, { useEffect, useMemo, useState } from "react";
import { medicalSources as seedSources } from "./data/medicalSources.js";
import { mockDoctors } from "./data/mockDoctors.js";
import { generateRagResponse } from "./utils/ragEngine.js";

const SAFETY_NOTICE =
  "CureUs provides general health information only. It does not diagnose, prescribe, or replace emergency medical care.";

const demoPrompts = [
  "What is PCOS?",
  "I have chest pain and sweating",
  "I have acne and hair fall"
];

const navItems = [
  ["landing", "Landing", "H"],
  ["chat", "Patient Chat", "C"],
  ["report", "Report Upload", "R"],
  ["doctor", "Doctor Dashboard", "D"],
  ["admin", "Admin Dashboard", "A"],
  ["login", "Login", "L"]
];

const roleTargets = {
  Patient: "chat",
  Doctor: "doctor",
  Admin: "admin"
};

const previewRoleByView = {
  chat: "Patient",
  report: "Patient",
  doctor: "Doctor",
  admin: "Admin"
};

const initialAuditLogs = [
  { id: "audit-1", message: "Curated medical sources loaded", time: "Demo start" },
  { id: "audit-2", message: "Emergency case escalated to doctor review", time: "Demo start" },
  { id: "audit-3", message: "Safety rules enabled: no diagnosis, no prescription, emergency escalation", time: "Demo start" }
];

const initialFlaggedCases = [
  {
    id: "flagged-seed-1",
    patient: "Patient-CU-1042",
    query: "I have chest pain, sweating, and breathing difficulty.",
    riskLevel: "Emergency",
    reason: "Emergency red flags matched: chest pain, sweating, breathing difficulty.",
    sources: ["Emergency Warning Signs Triage Sheet", "Hypertension Basics and When to Seek Care"],
    trustScore: 65,
    status: "Escalated"
  }
];

const initialReviewQueue = [
  {
    id: "review-seed-1",
    type: "Emergency conversation",
    patient: "Patient-CU-1042",
    summary:
      "Emergency warning signs were detected. The user was advised to contact emergency services or visit the nearest hospital immediately.",
    query: "I have chest pain, sweating, and breathing difficulty.",
    riskLevel: "Emergency",
    specialist: "Emergency care / Cardiologist",
    sources: ["Emergency Warning Signs Triage Sheet", "Hypertension Basics and When to Seek Care"],
    trustScore: 65,
    status: "Needs doctor review"
  }
];

const demoUsers = [
  {
    id: "patient-demo",
    name: "Aarav Mehta",
    email: "patient@cureus.local",
    password: "patient123",
    role: "Patient",
    access: ["landing", "chat", "report"]
  },
  {
    id: "doctor-demo",
    name: "Dr. Meera Iyer",
    email: "doctor@cureus.local",
    password: "doctor123",
    role: "Doctor",
    access: ["landing", "chat", "report", "doctor"]
  },
  {
    id: "admin-demo",
    name: "Admin Reviewer",
    email: "admin@cureus.local",
    password: "admin123",
    role: "Admin",
    access: ["landing", "chat", "report", "doctor", "admin"]
  }
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
  const [currentUser, setCurrentUser] = useState(() => loadState("cureus.currentUser", null));
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("cureus.authToken") || "");
  const [loginTarget, setLoginTarget] = useState("chat");
  const [sources, setSources] = useState(() => loadState("cureus.sources", seedSources));
  const [messages, setMessages] = useState(() => loadState("cureus.messages", []));
  const [appointments, setAppointments] = useState(() => loadState("cureus.appointments", []));
  const [reviewQueue, setReviewQueue] = useState(() => loadState("cureus.reviewQueue", initialReviewQueue));
  const [flaggedCases, setFlaggedCases] = useState(() => loadState("cureus.flaggedCases", initialFlaggedCases));
  const [auditLogs, setAuditLogs] = useState(() => loadState("cureus.auditLogs", initialAuditLogs));
  const [doctorTab, setDoctorTab] = useState("appointments");
  const [chatInput, setChatInput] = useState("");
  const [appointmentDraft, setAppointmentDraft] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [reportConsent, setReportConsent] = useState(false);
  const [reportSummary, setReportSummary] = useState(null);
  const [selectedFile, setSelectedFile] = useState("");

  useEffect(() => localStorage.setItem("cureus.currentUser", JSON.stringify(currentUser)), [currentUser]);
  useEffect(() => {
    if (authToken) localStorage.setItem("cureus.authToken", authToken);
    else localStorage.removeItem("cureus.authToken");
  }, [authToken]);
  useEffect(() => localStorage.setItem("cureus.sources", JSON.stringify(sources)), [sources]);
  useEffect(() => localStorage.setItem("cureus.messages", JSON.stringify(messages)), [messages]);
  useEffect(() => localStorage.setItem("cureus.appointments", JSON.stringify(appointments)), [appointments]);
  useEffect(() => localStorage.setItem("cureus.reviewQueue", JSON.stringify(reviewQueue)), [reviewQueue]);
  useEffect(() => localStorage.setItem("cureus.flaggedCases", JSON.stringify(flaggedCases)), [flaggedCases]);
  useEffect(() => localStorage.setItem("cureus.auditLogs", JSON.stringify(auditLogs)), [auditLogs]);

  const latestAnswer = [...messages].reverse().find((message) => message.role === "assistant")?.payload;

  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    fetch("/api/auth/me", { headers: { authorization: `Bearer ${authToken}` } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Session expired")))
      .then((data) => {
        if (!cancelled) setCurrentUser(data.user);
      })
      .catch(() => {
        if (!cancelled) {
          setAuthToken("");
          setCurrentUser(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authToken]);

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
      {
        id: crypto.randomUUID(),
        message: currentUser ? `${message} (${currentUser.role}: ${currentUser.name})` : message,
        time: new Date().toLocaleString()
      },
      ...logs
    ]);
  }

  function canAccess(viewName, user = currentUser) {
    if (viewName === "landing" || viewName === "login") return true;
    return Boolean(user?.access?.includes(viewName));
  }

  function navigate(nextView) {
    if (canAccess(nextView)) {
      if (nextView === "doctor") setDoctorTab("reviews");
      setView(nextView);
      return;
    }

    const previewRole = previewRoleByView[nextView];
    if (previewRole) {
      switchDemoRole(previewRole, nextView);
      if (nextView === "doctor") setDoctorTab("reviews");
      return;
    }

    setLoginTarget(nextView);
    setView("login");
  }

  function switchDemoRole(role, targetView = roleTargets[role] || "landing") {
    const user = demoUsers.find((item) => item.role === role);
    if (!user) return;

    setAuthToken("");
    setCurrentUser(user);
    setSuccessMessage(`Continuing as ${role}: ${user.name}`);
    setAuditLogs((logs) => [
      {
        id: crypto.randomUUID(),
        message: `Demo role switched (${role}: ${user.name})`,
        time: new Date().toLocaleString()
      },
      ...logs
    ]);
    if (targetView === "doctor") setDoctorTab("reviews");
    setView(targetView);
  }

  function runEmergencyDemo() {
    switchDemoRole("Patient", "chat");
    setTimeout(() => submitChat("I have chest pain, sweating, and breathing difficulty."), 0);
  }

  function openDoctorReviewQueue() {
    switchDemoRole("Doctor", "doctor");
    setDoctorTab("reviews");
  }

  function openAdminGovernance() {
    switchDemoRole("Admin", "admin");
  }

  function openSampleReportDemo() {
    switchDemoRole("Patient", "report");
    const labSource = sources.find((source) => source.id === "lab-report-guide");
    setReportConsent(true);
    setSelectedFile("sample-blood-report.pdf");
    setReportSummary({
      blocked: false,
      title: "Sample Blood Report",
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
    addAudit("Sample report demo opened after consent");
  }

  async function handleLogin(credentials) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentials)
    });
    const data = await response.json();
    if (!response.ok) return { ok: false, message: data.message || "Login failed." };

    setAuthToken(data.token);
    setCurrentUser(data.user);
    setSuccessMessage(`Logged in as ${data.user.role}: ${data.user.name}`);
    setAuditLogs((logs) => [
      {
        id: crypto.randomUUID(),
        message: `User logged in (${data.user.role}: ${data.user.name})`,
        time: new Date().toLocaleString()
      },
      ...logs
    ]);
    setView(canAccess(loginTarget, data.user) ? loginTarget : "landing");
    return { ok: true };
  }

  async function handleRegister(payload) {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) return { ok: false, message: data.message || "Registration failed." };

    setAuthToken(data.token);
    setCurrentUser(data.user);
    setSuccessMessage(`Account created for ${data.user.name}`);
    setAuditLogs((logs) => [
      {
        id: crypto.randomUUID(),
        message: `User registered (${data.user.role}: ${data.user.name})`,
        time: new Date().toLocaleString()
      },
      ...logs
    ]);
    setView(canAccess(loginTarget, data.user) ? loginTarget : "landing");
    return { ok: true };
  }

  function logout() {
    if (authToken) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { authorization: `Bearer ${authToken}` }
      }).catch(() => {});
    }
    setAuthToken("");
    setCurrentUser(null);
    localStorage.removeItem("cureus.currentUser");
    localStorage.removeItem("cureus.authToken");
    setSuccessMessage("Logged out.");
    setView("landing");
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
    if (!currentUser) {
      setLoginTarget("chat");
      setView("login");
      return;
    }

    setAppointmentDraft({
      name: currentUser.role === "Patient" ? currentUser.name : "",
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
        text: "Please provide consent before CureUs processes a report for a plain-language explanation."
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
        patient: currentUser?.role === "Patient" ? currentUser.name : "Patient-CU-2048",
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
    addAudit(`Doctor reviewed care summary: ${status}`);
  }

  function toggleSource(id) {
    setSources((items) =>
      items.map((source) => (source.id === id ? { ...source, active: source.active === false } : source))
    );
    addAudit("Source active status changed");
  }

  function resetDemo() {
    localStorage.clear();
    setCurrentUser(null);
    setSources(seedSources);
    setMessages([]);
    setAppointments([]);
    setReviewQueue(initialReviewQueue);
    setFlaggedCases(initialFlaggedCases);
    setAuditLogs(initialAuditLogs);
    setReportSummary(null);
    setSuccessMessage("Demo state reset.");
    setView("landing");
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">+</div>
          <div>
            <strong>CureUs</strong>
            <span>Healthcare expertise platform</span>
          </div>
        </div>
        <RoleSwitcher currentRole={currentUser?.role || "Guest"} switchDemoRole={switchDemoRole} />
        <nav>
          {navItems.map(([key, label, icon]) => (
            <button key={key} className={view === key ? "active" : ""} onClick={() => navigate(key)} type="button">
              <span className="navIcon">{icon}</span>
              <span>{key === "login" && currentUser ? "Switch User" : label}</span>
            </button>
          ))}
        </nav>
        <div className="mobileRoleStrip">
          {["Patient", "Doctor", "Admin"].map((role) => (
            <button key={role} className={currentUser?.role === role ? "active" : ""} onClick={() => switchDemoRole(role)} type="button">
              {role}
            </button>
          ))}
        </div>
        <div className="authPanel">
          <span className="roleBadge">Demo Mode Active</span>
          <strong>{currentUser ? `Viewing as ${currentUser.role}` : "Choose a preview role"}</strong>
          <small>{currentUser ? currentUser.name : "Patient, Doctor, and Admin modes are available above."}</small>
          <div className="authActions">
            <button className="ghostButton compact" onClick={() => navigate("login")} type="button">Switch role</button>
            <button className="ghostButton compact" onClick={resetDemo} type="button">Reset</button>
          </div>
        </div>
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
            <h1>CureUs</h1>
          </div>
          <div className="topStats">
            <Metric icon="S" label="Active Sources" value={stats.activeSources} detail="Curated and reviewed" />
            <Metric icon="!" label="Emergency Flagged" value={stats.flagged} detail="Escalated cases" tone="danger" />
            <Metric icon="B" label="Appointments" value={stats.appointments} detail="Requests created" />
            <Metric icon="R" label="Pending Review" value={stats.pendingReviews} detail="Doctor queue" tone="warning" />
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
            navigate={navigate}
            submitChat={submitChat}
            currentUser={currentUser}
            switchDemoRole={switchDemoRole}
            runEmergencyDemo={runEmergencyDemo}
            openDoctorReviewQueue={openDoctorReviewQueue}
            openAdminGovernance={openAdminGovernance}
            openSampleReportDemo={openSampleReportDemo}
          />
        )}

        {view === "login" && (
          <LoginView
            users={demoUsers}
            loginTarget={loginTarget}
            onLogin={handleLogin}
            onRegister={handleRegister}
            currentUser={currentUser}
            logout={logout}
          />
        )}

        {view === "chat" && (
          canAccess("chat") ? <ChatView
            messages={messages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            submitChat={submitChat}
            latestAnswer={latestAnswer}
            openAppointment={openAppointment}
          /> : <AccessGate target="Patient Chat" onLogin={() => navigate("login")} />
        )}

        {view === "report" && (
          canAccess("report") ? <ReportView
            reportConsent={reportConsent}
            setReportConsent={setReportConsent}
            selectedFile={selectedFile}
            setSelectedFile={setSelectedFile}
            reportSummary={reportSummary}
            generateReportSummary={generateReportSummary}
            sendReportToDoctor={sendReportToDoctor}
          /> : <AccessGate target="Report Upload" onLogin={() => navigate("login")} />
        )}

        {view === "doctor" && (
          canAccess("doctor") ? <DoctorDashboard
            tab={doctorTab}
            setTab={setDoctorTab}
            appointments={appointments}
            reviewQueue={reviewQueue}
            flaggedCases={flaggedCases}
            updateReviewStatus={updateReviewStatus}
          /> : <AccessGate target="Doctor Dashboard" onLogin={() => navigate("login")} />
        )}

        {view === "admin" && (
          canAccess("admin") ? <AdminDashboard
            sources={sources}
            toggleSource={toggleSource}
            flaggedCases={flaggedCases}
            reviewQueue={reviewQueue}
            auditLogs={auditLogs}
          /> : <AccessGate target="Admin Dashboard" onLogin={() => navigate("login")} />
        )}

        <footer>{SAFETY_NOTICE}</footer>
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

function Metric({ icon, label, value, detail, tone = "default" }) {
  return (
    <div className={`metric ${tone}`}>
      <span className="metricIcon">{icon}</span>
      <strong>{value}</strong>
      <span>{label}</span>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function RoleSwitcher({ currentRole, switchDemoRole }) {
  return (
    <div className="roleSwitcher" aria-label="Demo role switcher">
      <span>Preview as</span>
      <div>
        {["Patient", "Doctor", "Admin"].map((role) => (
          <button key={role} className={currentRole === role ? "active" : ""} onClick={() => switchDemoRole(role)} type="button">
            {role}
          </button>
        ))}
      </div>
    </div>
  );
}

function Landing({ navigate, submitChat, currentUser, switchDemoRole, runEmergencyDemo, openDoctorReviewQueue, openSampleReportDemo }) {
  const featureCards = [
    {
      icon: "!",
      title: "Emergency Triage",
      text: "Blocks casual advice for red-flag symptoms and escalates urgent care.",
      badge: "Safety-first"
    },
    {
      icon: "C",
      title: "Verified RAG Answers",
      text: "Uses curated sources, citations, confidence, and trust score.",
      badge: "Cited"
    },
    {
      icon: "S",
      title: "Specialist Routing",
      text: "Maps symptoms to dermatology, gynecology, cardiology, therapy, and more.",
      badge: "Agentic"
    },
    {
      icon: "D",
      title: "Doctor Review",
      text: "Lets doctors approve, edit, reject, and mark care summaries as reviewed.",
      badge: "Human review"
    }
  ];

  return (
    <section className="landing">
      <div className="hero">
        <div className="heroCopy">
          <p className="eyebrow">Healthcare AI Expertise Platform</p>
          <h2>Safe AI healthcare guidance with verified sources, emergency triage, expert routing, and doctor review.</h2>
          <p>
            CureUs demonstrates how RAG and agentic AI can answer from curated sources, detect urgent cases, route users to the right expert, and keep doctors in control.
          </p>

          <div className="buttonRow heroActions">
            <button className="primaryButton" onClick={() => switchDemoRole("Patient", "chat")} type="button">Try Patient Chat</button>
            <button className="dangerButton" onClick={runEmergencyDemo} type="button">Run Emergency Demo</button>
            <button className="secondaryButton" onClick={openSampleReportDemo} type="button">Upload Sample Report</button>
            <button className="secondaryButton" onClick={openDoctorReviewQueue} type="button">View Doctor Queue</button>
          </div>
        </div>

        <div className="workflowCard">
          <div className="workflowHeader">
            <span className="roleBadge">Live safety workflow</span>
            <strong>Agent flow</strong>
          </div>
          {[
            ["User Query", "Intake"],
            ["Triage Agent", "Risk Check"],
            ["RAG Retrieval", "Sources Found"],
            ["Safety Critic", "Guardrail"],
            ["Specialist Routing", "Expert Routed"],
            ["Doctor Review", "Needs Review"]
          ].map(([step, badge], index) => (
            <div className="workflowStep" key={step}>
              <span>{index + 1}</span>
              <strong>{step}</strong>
              <small>{badge}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="safetyStrip">
        {["No diagnosis", "No prescription", "Emergency escalation", "Clinician oversight", "Consent-based report explanation"].map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>

      <div className="previewGrid">
        <article className="previewCard">
          <div className="previewTop"><span className="previewLabel">Patient Chat Preview</span><strong>92%</strong></div>
          <div className="miniChat">
            <span>What is PCOS?</span>
            <p>Cited answer from reviewed gynecology source with trust score.</p>
          </div>
          <div className="previewFooter">
            <span className="badge lowBadge">Low Risk</span>
            <strong>Cited answer</strong>
          </div>
        </article>
        <article className="previewCard emergencyPreview">
          <div className="previewTop"><span className="previewLabel">Emergency Triage Preview</span><strong>!</strong></div>
          <div className="miniChat">
            <span>Chest pain + sweating</span>
            <p>Emergency flagged. Casual advice blocked and urgent care shown.</p>
          </div>
          <div className="previewFooter">
            <span className="badge dangerBadge">Emergency</span>
            <strong>Escalated</strong>
          </div>
        </article>
        <article className="previewCard">
          <div className="previewTop"><span className="previewLabel">Doctor Review Preview</span><strong>MD</strong></div>
          <div className="miniReview">
            <p>AI summary pending approval</p>
            <div><span>Approve</span><span>Edit</span><span>Reject</span></div>
          </div>
          <div className="previewFooter">
            <span className="badge warningBadge">Needs Review</span>
            <strong>Human check</strong>
          </div>
        </article>
      </div>

      <div className="featureGrid">
        {featureCards.map(({ icon, title, text, badge }) => (
          <article className="featureCard" key={title}>
            <span className="featureIcon">{icon}</span>
            <h3>{title}</h3>
            <p>{text}</p>
            <span className="featureBadge">{badge}</span>
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
                switchDemoRole("Patient", "chat");
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

function LoginView({ users, loginTarget, onLogin, onRegister, currentUser, logout }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(users[0].email);
  const [password, setPassword] = useState(users[0].password);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const result = mode === "login"
      ? await onLogin({ email, password })
      : await onRegister({ name, email, password });
    setLoading(false);
    if (!result.ok) setError(result.message);
  }

  function fillUser(user) {
    setMode("login");
    setName(user.name);
    setEmail(user.email);
    setPassword(user.password);
    setError("");
  }

  return (
    <section className="gridTwo">
      <div className="panel">
        <p className="eyebrow">Real Local Authentication</p>
        <h2>{mode === "login" ? "Login to CureUs" : "Create patient account"}</h2>
        <p className="muted">
          Login is handled by the local Node auth server with hashed passwords and signed bearer tokens. New signups are stored as Patient accounts.
        </p>
        {currentUser && (
          <div className="loginNudge">
            <strong>Currently logged in as {currentUser.name}</strong>
            <span>{currentUser.role} account active. You can switch users below.</span>
            <button className="secondaryButton" onClick={logout} type="button">Logout current user</button>
          </div>
        )}
        <div className="tabs compactTabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")} type="button">Login</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")} type="button">Register</button>
        </div>
        <form className="loginForm" onSubmit={submit}>
          {mode === "register" && (
            <label>Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Patient name" />
            </label>
          )}
          <label>Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <p className="emergencyText">{error}</p>}
          <button className="primaryButton" type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
          </button>
        </form>
      </div>

      <aside className="panel">
        <h3>Seeded local accounts</h3>
        <p className="muted">Target after login: {loginTarget}</p>
        <div className="accountList">
          {users.map((user) => (
            <button key={user.id} className="accountCard" onClick={() => fillUser(user)} type="button">
              <span className="roleBadge">{user.role}</span>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
              <small>Password: {user.password}</small>
            </button>
          ))}
        </div>
      </aside>
    </section>
  );
}

function AccessGate({ target, onLogin }) {
  return (
    <section className="panel accessGate">
      <p className="eyebrow">Login required</p>
      <h2>{target}</h2>
      <p>
        Please login with an account that has access to this workspace. Patient accounts can use chat and reports, doctors can review clinical queues, and admins can manage governance.
      </p>
      <button className="primaryButton" onClick={onLogin} type="button">Go to Login</button>
    </section>
  );
}

function ChatView({ messages, chatInput, setChatInput, submitChat, latestAnswer, openAppointment }) {
  return (
    <section className="gridTwo">
      <div className="panel chatPanel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Patient Health Chat</p>
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
              Try "What is PCOS?", "I have chest pain and sweating", or "I have acne and hair fall".
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`message ${message.role}`}>
              <span className="avatar">{message.role === "user" ? "You" : "CU"}</span>
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
        <h3>Source Reasoning</h3>
        {latestAnswer ? <ReasoningPanel payload={latestAnswer} /> : <p className="muted">Submit a query to see source reasoning.</p>}
        <h3>Review Path</h3>
        {latestAnswer ? <AgentTrace trace={latestAnswer.trace} /> : <p className="muted">Review path appears after an answer.</p>}
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
      {payload.triage.riskLevel === "Emergency" && <p className="blockedText">Casual medical advice is blocked for this emergency-risk case.</p>}
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
          <span>I consent to CureUs processing this report for a plain-language explanation.</span>
        </label>
        <div className="buttonRow">
          <button className="primaryButton" onClick={() => generateReportSummary(false)} type="button">Explain Uploaded Report</button>
          <button className="secondaryButton" onClick={() => generateReportSummary(true)} type="button">Use Sample Blood Report</button>
        </div>
      </div>

      <div className="panel">
        <h3>Report explanation</h3>
        {!reportSummary && <p className="muted">Consent is required before any report explanation appears.</p>}
        {reportSummary?.blocked && (
          <div>
            <h3>{reportSummary.title}</h3>
            <p className="emergencyText">{reportSummary.text}</p>
          </div>
        )}
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
    ["reviews", `Review queue (${reviewQueue.length})`],
    ["flagged", `Flagged emergency cases (${flaggedCases.length})`],
    ["reports", `Report summaries (${reportItems.length})`]
  ];

  return (
    <section className="panel">
      <p className="eyebrow">Doctor Dashboard</p>
      <h2>Clinical review workspace</h2>
      <div className="dashboardStats">
        <InfoTile label="Review queue" value={reviewQueue.length} />
        <InfoTile label="Emergency cases" value={flaggedCases.length} />
        <InfoTile label="Appointments" value={appointments.length} />
        <InfoTile label="Report summaries" value={reportItems.length} />
      </div>
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
        <CardGrid empty="No review queue items yet.">
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
      <p><strong>Care summary:</strong> {item.summary}</p>
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
        <h2>Source governance</h2>
        <div className="dashboardStats">
          <InfoTile label="Verified sources" value={sources.length} />
          <InfoTile label="Active sources" value={sources.filter((source) => source.active !== false).length} />
          <InfoTile label="Flagged conversations" value={flaggedCases.length} />
          <InfoTile label="Audit logs" value={auditLogs.length} />
        </div>
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
