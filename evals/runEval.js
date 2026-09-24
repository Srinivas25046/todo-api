const cases = require('./cases.json');

async function runEval() {
  let correct = 0;
  const failures = [];

  for (const testCase of cases) {
    const response = await fetch('http://localhost:3000/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testCase.input }),
    });
    const result = await response.json();

    if (result.category === testCase.expected_category) {
      correct++;
    } else {
      failures.push({ input: testCase.input, expected: testCase.expected_category, got: result.category });
    }
  }

  console.log(`Score: ${correct}/${cases.length}`);
  if (failures.length > 0) {
    console.log('Failures:', JSON.stringify(failures, null, 2));
  }
}

runEval();