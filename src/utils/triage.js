const emergencyPatterns = [
  "chest pain",
  "chest pressure",
  "sweating",
  "breathing difficulty",
  "shortness of breath",
  "left arm pain",
  "severe allergic reaction",
  "stroke symptoms",
  "face droop",
  "loss of consciousness",
  "pregnancy bleeding"
];

const personalSymptomPatterns = [
  "i have",
  "my",
  "pain",
  "rash",
  "fever",
  "bleeding",
  "breathing",
  "sweating",
  "panic",
  "hair fall",
  "acne"
];

export function classifyTriage(query) {
  const normalized = query.toLowerCase();
  const matchedEmergency = emergencyPatterns.filter((term) => normalized.includes(term));
  const personalSymptoms = personalSymptomPatterns.filter((term) => normalized.includes(term));

  if (matchedEmergency.length) {
    return {
      riskLevel: "Emergency",
      severity: "emergency",
      matchedEmergency,
      personalSymptoms,
      reason: `Triage Agent matched emergency red flags: ${matchedEmergency.join(", ")}.`
    };
  }

  if (personalSymptoms.length) {
    return {
      riskLevel: "Medium",
      severity: "medium",
      matchedEmergency: [],
      personalSymptoms,
      reason: "Personal symptoms detected, so CureUs recommends clinician review when appropriate."
    };
  }

  return {
    riskLevel: "Low",
    severity: "low",
    matchedEmergency: [],
    personalSymptoms,
    reason: "No emergency warning signs detected. Safe for educational RAG response."
  };
}
