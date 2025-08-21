// Inclusive Job Ad Rewriter (CORS + OpenAI)
// Endpoint: POST /api/rewrite
// Uses CommonJS to avoid module issues on Vercel

function allowOrigin(origin) {
  const list = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!origin) return list[0] || "*";
  return list.includes(origin) ? origin : (list[0] || "*");
}

module.exports = async function handler(req, res) {
  // --- CORS ---
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", allowOrigin(origin));
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const text = (body.text || "").toString();
    if (!text || text.length < 40) return res.status(400).json({ error: "Provide a job ad (min 40 chars)." });

    const tone = ["professional","warm"].includes(body.tone) ? body.tone : "professional";
    const lengthPref = ["short","standard"].includes(body.length) ? body.length : "standard";
    const readingLevel = Number.isFinite(body.reading_level_target) ? body.reading_level_target : 60;
    const neuro = body.neuroinclusive !== false; // default true

    const systemPrompt = `
You are an HR inclusion editor for New Zealand job ads.

GOALS:
- Remove biased/coded language (gendered, ageist, ableist).
- Keep only essential, safety- and capability-critical requirements.
- Produce a plain-English, neuroinclusive (ASD-friendly) rewrite.

PLAIN-ENGLISH & ASD-FRIENDLY:
- Short sentences (12–18 words). One idea per sentence.
- No idioms, metaphors, sarcasm, or cultural references that need inference.
- Concrete words; avoid jargon and abstractions.
- Logical order: Role → Impact → Key tasks → Must-have → Nice-to-have → Hours/location → Pay → How to apply.
- Direct address (“You will…”, “We offer…”). No filler.
- Sensory-friendly: avoid “fast-paced” etc. unless essential; describe actual pace/load if needed.
- Include a line welcoming adjustments; prompt salary band if missing.

READING LEVEL:
- Target Flesch ${Math.round(readingLevel)} (approx). Prefer clarity over style.

NZ CONTEXT:
- Align to NZ Human Rights and Employment best practice; neutral and fair.
- If right to work is needed: “You must be legally entitled to work in NZ.”

OUTPUT FORMAT (STRICT JSON):
{
 "bias_score": 0-100,
 "issues": [{"type": "gendered|age|ableist|requirements|jargon|accessibility|structure|plain_english", "note": "string"}],
 "reading_level": "Flesch X (target ${Math.round(readingLevel)})",
 "rewrite": "string",
 "changelog": [{"before":"", "after":"", "reason": ""}],
 "suggested_additions": ["salary band", "reasonable adjustments", "flexible options"]
}
Return ONLY valid JSON, no commentary.`.trim();

    const userPrompt = `
TEXT:
${text}

PREFERENCES:
tone=${tone}, length=${lengthPref}, neuroinclusive=${neuro}
- If salary band is missing, include "TODO: Add salary band".
- Keep bullets tight and parallel.
- Keep legal/safety requirements if essential.
- If duties are unclear, infer briefly and mark as "example".`.trim();

    // --- OpenAI call ---
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY not set" });

    const oaResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });

    if (!oaResp.ok) {
      const errText = await oaResp.text().catch(() => "");
      return res.status(oaResp.status).json({ error: `OpenAI error ${oaResp.status}`, detail: errText });
    }

    const data = await oaResp.json();
    const content = data?.choices?.[0]?.message?.content || "{}";
    let jsonOut;
    try { jsonOut = JSON.parse(content); }
    catch { return res.status(502).json({ error: "Model did not return valid JSON", raw: content }); }

    if (typeof jsonOut.rewrite !== "string") {
      return res.status(502).json({ error: "Missing 'rewrite' in model output", raw: jsonOut });
    }

    return res.status(200).json(jsonOut);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
};
