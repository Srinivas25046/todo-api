const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL,
  apiKey: process.env.LLM_API_KEY,
});

const PROMPT_VERSION = 'triage-v1';
const systemPrompt = fs.readFileSync(
  path.join(__dirname, '..', '..', 'prompts', `${PROMPT_VERSION}.md`),
  'utf-8'
);

async function callModel(userText) {
  const response = await client.chat.completions.create({
    model: process.env.LLM_MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
  });

  return response.choices[0].message.content;
}

module.exports = { callModel, PROMPT_VERSION };