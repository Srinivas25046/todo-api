const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL,
  apiKey: process.env.LLM_API_KEY,
  timeout: 30000, // 30 seconds — the SDK default of 10 minutes is not a real timeout for an endpoint
  maxRetries: 0,  // we implement our own retry logic below, not the SDK's silent default of 2
});
const PROMPT_VERSION = 'triage-v1';
const systemPrompt = fs.readFileSync(
  path.join(__dirname, '..', '..', 'prompts', `${PROMPT_VERSION}.md`),
  'utf-8'
);

async function callModel(userText, repairContext = null) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText },
  ];

  if (repairContext) {
    messages.push({ role: 'assistant', content: repairContext.previousOutput });
    messages.push({
      role: 'user',
      content: `Your previous answer was rejected for this reason: ${repairContext.error}\nReturn only corrected JSON matching the schema.`,
    });
  }

  const response = await client.chat.completions.create({
    model: process.env.LLM_MODEL,
    temperature: 0,
    messages,
  });

  return response.choices[0].message.content;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callModelOnce(messages) {
  const startTime = Date.now();
  const response = await client.chat.completions.create({
    model: process.env.LLM_MODEL,
    temperature: 0,
    messages,
  });
  const durationMs = Date.now() - startTime;

  console.log(JSON.stringify({
    log_type: 'llm_call',
    prompt_version: PROMPT_VERSION,
    model: process.env.LLM_MODEL,
    input_tokens: response.usage?.prompt_tokens,
    output_tokens: response.usage?.completion_tokens,
    duration_ms: durationMs,
  }));

  return response.choices[0].message.content;
}

async function callModelWithRetry(messages, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callModelOnce(messages);
    } catch (err) {
      const status = err.status;
      const isRetryable = status === 429 || (status >= 500 && status < 600) || err.name === 'APIConnectionTimeoutError';

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      console.log(`RETRYING (attempt ${attempt + 1}) after ${Math.round(backoffMs)}ms — status ${status}`);
      await sleep(backoffMs);
    }
  }
}

module.exports = { callModel, PROMPT_VERSION };