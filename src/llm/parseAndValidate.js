const { TriageOutputSchema } = require('./schema');

function extractJson(rawText) {
  // Strip a markdown code fence if the model wrapped its answer in one
  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : rawText;

  // Find the first { ... } block in case there's extra text around it
  const braceMatch = candidate.match(/\{[\s\S]*\}/);
  const jsonText = braceMatch ? braceMatch[0] : candidate;

  return JSON.parse(jsonText); // may throw — caller handles it
}

function parseAndValidate(rawText) {
  let parsed;
  try {
    parsed = extractJson(rawText);
  } catch (err) {
    return { success: false, error: `Could not parse JSON: ${err.message}` };
  }

  const result = TriageOutputSchema.safeParse(parsed);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  return { success: true, data: result.data };
}

module.exports = parseAndValidate;