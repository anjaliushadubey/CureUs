const routingRules = [
  {
    specialist: "Dermatologist",
    urgency: "Non-emergency. Consult within 3-5 days if persistent or worsening.",
    reason: "Acne, rash, and hair fall often need skin or scalp examination.",
    keywords: ["acne", "rash", "hair fall", "itch", "skin"]
  },
  {
    specialist: "Gynecologist",
    urgency: "Routine consult unless severe pain, heavy bleeding, or pregnancy warning signs occur.",
    reason: "Irregular periods and PCOS questions need gynecology context.",
    keywords: ["irregular periods", "pcos", "period", "pregnancy", "pelvic"]
  },
  {
    specialist: "Cardiologist",
    urgency: "Emergency if chest pain, sweating, breathlessness, or left arm pain is present.",
    reason: "Chest symptoms and blood pressure concerns can be heart-related and need careful triage.",
    keywords: ["chest", "bp", "blood pressure", "heart", "left arm pain"]
  },
  {
    specialist: "Psychologist/Psychiatrist",
    urgency: "Prompt support recommended. Emergency help if self-harm thoughts are present.",
    reason: "Anxiety and panic can benefit from qualified mental health support.",
    keywords: ["anxiety", "panic", "stress", "depression", "sleep"]
  },
  {
    specialist: "Orthopedic/Physiotherapist",
    urgency: "Consult if pain persists, follows injury, swelling appears, or movement is restricted.",
    reason: "Joint pain may need movement, injury, and inflammation assessment.",
    keywords: ["joint pain", "knee", "shoulder", "back pain", "injury"]
  },
  {
    specialist: "Nutritionist/Endocrinologist",
    urgency: "Routine consultation for diet planning and metabolic risk.",
    reason: "Diabetes diet and nutrition questions should consider labs, medication, and goals.",
    keywords: ["diet", "diabetes diet", "nutrition", "weight", "sugar"]
  }
];

export function routeSpecialist(query) {
  const normalized = query.toLowerCase();
  const match = routingRules.find((rule) => rule.keywords.some((keyword) => normalized.includes(keyword)));

  return match || {
    specialist: "General Physician",
    urgency: "Routine consultation if symptoms persist or you are concerned.",
    reason: "A general physician can assess symptoms and route to a specialist if needed.",
    keywords: []
  };
}
