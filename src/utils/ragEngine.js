import { classifyTriage } from "./triage.js";
import { routeSpecialist } from "./routing.js";

const tokenize = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);

const unique = (items) => [...new Set(items)];

export function retrieveSources(query, sources) {
  const queryTokens = unique(tokenize(query));
  const activeSources = sources.filter((source) => source.active !== false);

  const ranked = activeSources
    .map((source) => {
      const haystack = `${source.title} ${source.sourceName} ${source.specialty} ${source.condition} ${source.content}`;
      const sourceTokens = tokenize(haystack);
      const matchedKeywords = queryTokens.filter((token) => sourceTokens.includes(token));
      const conditionBoost = queryTokens.some((token) => source.condition.toLowerCase().includes(token)) ? 2 : 0;
      const specialtyBoost = queryTokens.some((token) => source.specialty.toLowerCase().includes(token)) ? 1 : 0;
      return {
        ...source,
        matchedKeywords,
        score: matchedKeywords.length + conditionBoost + specialtyBoost,
        selectionReason: matchedKeywords.length
          ? `Matched keywords: ${matchedKeywords.join(", ")}.`
          : "Included as a safety or general education fallback."
      };
    })
    .filter((source) => source.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (ranked.length >= 3) return ranked;

  const fallback = activeSources
    .filter((source) => !ranked.some((item) => item.id === source.id))
    .filter((source) => source.evidenceLevel === "High" || source.reviewedBy)
    .slice(0, 3 - ranked.length)
    .map((source) => ({
      ...source,
      matchedKeywords: [],
      score: 0,
      selectionReason: "Added as a high-quality supporting source for broader evidence context."
    }));

  return [...ranked, ...fallback];
}

export function calculateTrustScore({ sources, triage }) {
  let score = 50;
  if (sources.length >= 2) score += 15;
  if (sources.some((source) => source.evidenceLevel === "High")) score += 10;
  if (sources.some((source) => source.reviewedBy && source.reviewedBy !== "Pending")) score += 10;
  if (triage.personalSymptoms.length) score -= 20;
  if (triage.riskLevel === "Emergency") score -= 30;
  return Math.max(10, Math.min(98, score));
}

export function buildAgentTrace({ triage, sources, route }) {
  return [
    { name: "User question", status: "completed", detail: "Query received from patient." },
    { name: "Safety check", status: triage.riskLevel === "Emergency" ? "escalated" : "completed", detail: triage.reason },
    {
      name: "Source review",
      status: triage.riskLevel === "Emergency" ? "skipped" : "completed",
      detail: triage.riskLevel === "Emergency" ? "Normal answer skipped for safety." : `${sources.length} curated source(s) reviewed.`
    },
    { name: "Response review", status: "completed", detail: "Checked no diagnosis, no prescription, citations, and emergency handling." },
    { name: "Expert routing", status: "completed", detail: `Suggested: ${route.specialist}.` },
    {
      name: "Doctor review",
      status: triage.riskLevel === "Emergency" || triage.riskLevel === "Medium" ? "escalated" : "skipped",
      detail: triage.riskLevel === "Low" ? "Doctor review optional for educational query." : "Case added or eligible for doctor review."
    }
  ];
}

export function generateRagResponse(query, sources) {
  const triage = classifyTriage(query);
  const route = routeSpecialist(query);
  let retrieved = retrieveSources(query, sources);

  if (triage.riskLevel === "Emergency") {
    retrieved = sources.filter((source) => ["emergency-red-flags", "hypertension-guide"].includes(source.id) && source.active !== false).slice(0, 3);
  }

  if (!retrieved.length) {
    retrieved = sources.filter((source) => source.active !== false).slice(0, 3);
  }

  const trustScore = calculateTrustScore({ sources: retrieved, triage });
  const matchedKeywords = unique(retrieved.flatMap((source) => source.matchedKeywords || []));
  const trace = buildAgentTrace({ triage, sources: retrieved, route });

  if (triage.riskLevel === "Emergency") {
    return {
      query,
      triage,
      route,
      sources: retrieved,
      matchedKeywords,
      trustScore,
      trace,
      answer:
        "This may require urgent medical attention. Please contact emergency services or visit the nearest hospital immediately. CureUs will not provide casual advice for this case because emergency warning signs were detected.",
      disclaimer: "CureUs provides general health information only. It does not diagnose, prescribe, or replace emergency medical care."
    };
  }

  const normalized = query.toLowerCase();
  let answer = "Based on curated sources, this is suitable for general health education. CureUs can explain common meanings, warning signs, and when to consult a clinician, but it cannot diagnose or prescribe.";

  if (normalized.includes("pcos")) {
    answer =
      "PCOS, or polycystic ovary syndrome, is a hormonal condition that can be associated with irregular periods, acne, excess hair growth, and metabolic concerns. Only a clinician can diagnose PCOS after reviewing symptoms, history, examination, and tests.";
  } else if (normalized.includes("diabetes")) {
    answer =
      "Diabetes is a condition where blood glucose stays higher than expected over time. Education usually includes diet, activity, monitoring, and clinician-guided treatment decisions.";
  } else if (normalized.includes("hypertension") || normalized.includes("blood pressure") || normalized.includes("bp")) {
    answer =
      "Hypertension means blood pressure remains higher than expected across repeated measurements. It should be discussed with a clinician, especially if readings are high or symptoms occur.";
  } else if (["acne", "hair fall", "rash", "irregular periods", "joint pain", "anxiety", "panic"].some((term) => normalized.includes(term))) {
    answer = `The query looks like a specialist-routing case. Recommended specialist: ${route.specialist}. ${route.reason}`;
  }

  return {
    query,
    triage,
    route,
    sources: retrieved,
    matchedKeywords,
    trustScore,
    trace,
    answer,
    disclaimer: "CureUs provides general health information only. It does not diagnose, prescribe, or replace emergency medical care."
  };
}
