
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

if (!API_KEY) {
  console.warn('\u26A0\uFE0F  GEMINI_API_KEY is not set. Copy .env.example to .env and add your key (free, no card needed \u2014 see README).');
}

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Gemini helper ----------
// `content` is an array of Anthropic-style content blocks:
//   { type: 'text', text: '...' }
//   { type: 'image', source: { base64: '...', media_type: 'image/png' } }
// This gets translated into Gemini's "parts" format below, so the route
// handlers further down don't need to know which provider is behind them.
async function callGemini(system, content) {
  if (!API_KEY) {
    throw new Error('Server is missing GEMINI_API_KEY. Add it to your .env file and restart.');
  }

  const parts = content.map((item) => {
    if (item.type === 'image') {
      return { inline_data: { mime_type: item.source.media_type || 'image/png', data: item.source.base64 } };
    }
    return { text: item.text };
  });

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + API_KEY;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: parts }],
      generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const message = (data && data.error && data.error.message) || ('Gemini API error (status ' + response.status + ')');
    throw new Error(message);
  }

  const candidate = data.candidates && data.candidates[0];
  const textParts = (candidate && candidate.content && candidate.content.parts) || [];
  const text = textParts.map((p) => p.text || '').join('\n');

  if (!text) {
    const finishReason = candidate && candidate.finishReason;
    throw new Error('Gemini returned no text' + (finishReason ? (' (finishReason: ' + finishReason + ')') : '') + '.');
  }
  return text;
}

function parseJSON(text) {
  let t = text.trim();
  t = t.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

// ---------- Routes ----------

// Analyze a question (text and/or image) -> { problemText, subject, difficulty, reasoning }
app.post('/api/analyze', async (req, res) => {
  try {
    const text = (req.body && req.body.text) || '';
    const image = req.body && req.body.image; // { base64, mediaType }
    const category = (req.body && req.body.category) || 'General'; // dsa, puzzle, sql, general

    if (!text && !image) {
      return res.status(400).json({ error: 'Provide question text or an image.' });
    }

    const content = [];
    if (image && image.base64) {
      content.push({
        type: 'image',
        source: { base64: image.base64, media_type: image.mediaType || 'image/png' }
      });
    }

    let prompt = 'A student submitted the following ' + category + ' problem';
    prompt += image
      ? (' (see attached image' + (text ? ', plus this note: "' + text + '"' : '') + '). Transcribe the problem text from the image accurately.')
      : (': "' + text + '"');
    prompt += ' Analyze it and respond with ONLY raw JSON, no markdown fences, in this exact shape: '
      + '{"problemText": "the full problem restated clearly", "subject": "short subject label e.g. DSA (Arrays), SQL (Joins), Logic Puzzle, Physics", "difficulty": 1, "reasoning": "one short sentence on why this difficulty level"}. '
      + 'difficulty must be the integer 1, 2, or 3, where 1 = straightforward/single-step, 2 = moderate/multi-step, 3 = complex/requires deep conceptual understanding or multiple concepts combined.';
    content.push({ type: 'text', text: prompt });

    const system = 'You are an expert academic tutor and problem analyzer for StudyBuddy. The student categorized this problem as ' + category + '. You always respond with strict, valid, parseable JSON only — no prose, no markdown code fences.';

    const raw = await callGemini(system, content);
    const parsed = parseJSON(raw);
    let d = parseInt(parsed.difficulty, 10);
    if ([1, 2, 3].indexOf(d) === -1) d = 2;
    parsed.difficulty = d;
    res.json(parsed);
  } catch (err) {
    console.error('analyze error:', err);
    res.status(500).json({ error: err.message || 'Failed to analyze the problem.' });
  }
});

// Get the next hint -> { hint }
app.post('/api/hint', async (req, res) => {
  try {
    const problemText = req.body && req.body.problemText;
    const hintNumber = req.body && req.body.hintNumber;
    const previousHints = (req.body && Array.isArray(req.body.previousHints)) ? req.body.previousHints : [];
    const category = (req.body && req.body.category) || 'General';

    if (!problemText || !hintNumber) {
      return res.status(400).json({ error: 'Missing problemText or hintNumber.' });
    }

    const history = previousHints.length
      ? previousHints.map(function (h, i) { return 'Hint ' + (i + 1) + ': ' + h; }).join('\n')
      : '(no hints given yet)';

    let categoryInstruction = '';
    if (category === 'DSA') {
      categoryInstruction = ' This is a Data Structures & Algorithms (DSA) problem. Focus hints on logic, algorithmic thinking, structure selection, optimization, and complexity without writing actual code.';
    } else if (category === 'SQL') {
      categoryInstruction = ' This is a SQL database query problem. Focus hints on query blocks (e.g., joins, aggregation, grouping, ordering, filters) without writing the full query.';
    } else if (category === 'Puzzle') {
      categoryInstruction = ' This is a logical puzzle or riddle. Focus hints on logical deductions, patterns, or simplified cases without revealing the core "trick" or "aha!" moment.';
    }

    const prompt = 'Problem: "' + problemText + '"\nCategory: ' + category + '\n\nHints already given:\n' + history +
      '\n\nGive hint number ' + hintNumber + ' of 5. It should be noticeably more revealing than the previous hint, guiding the student closer to the method or the answer, but do NOT state the final answer outright unless this is hint 5, in which case you may reveal the key final step needed but phrase it as still guiding them to compute/state it themselves. Keep it to 2-3 sentences. ' + categoryInstruction + ' Respond with plain text only, the hint itself, nothing else (no "Hint X:" prefix, no markdown).';

    const system = 'You are a patient, encouraging academic tutor at StudyBuddy giving progressive, Socratic-style hints. Never dump a full worked solution in a hint.';

    const hint = await callGemini(system, [{ type: 'text', text: prompt }]);
    res.json({ hint: hint.trim() });
  } catch (err) {
    console.error('hint error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch a hint.' });
  }
});

// Get the full worked solution -> { solution }
app.post('/api/solution', async (req, res) => {
  try {
    const problemText = req.body && req.body.problemText;
    const category = (req.body && req.body.category) || 'General';

    if (!problemText) {
      return res.status(400).json({ error: 'Missing problemText.' });
    }

    let categoryInstruction = '';
    if (category === 'DSA') {
      categoryInstruction = ' Since this is a DSA problem, provide clear structured code (or pseudocode) along with time/space complexity analysis.';
    } else if (category === 'SQL') {
      categoryInstruction = ' Since this is a SQL problem, provide the final correct query with an explanation of each clause (JOIN, WHERE, GROUP BY, etc.).';
    } else if (category === 'Puzzle') {
      categoryInstruction = ' Since this is a logical puzzle, clearly explain the logical deduction process and state the final answer.';
    }

    const prompt = 'Problem: "' + problemText + '"\nCategory: ' + category + '\n\nProvide a complete, clearly worked, step-by-step solution suitable for a student who has used all their hints and still needs the full walkthrough. Use short numbered steps. ' + categoryInstruction + ' Plain text, no markdown headers.';
    const system = 'You are an academic tutor at StudyBuddy providing a full worked solution.';

    const solution = await callGemini(system, [{ type: 'text', text: prompt }]);
    res.json({ solution: solution.trim() });
  } catch (err) {
    console.error('solution error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch the solution.' });
  }
});

// Check a student's answer -> { correct, feedback }
app.post('/api/check-answer', async (req, res) => {
  try {
    const problemText = req.body && req.body.problemText;
    const userAnswer = req.body && req.body.userAnswer;
    if (!problemText || !userAnswer) {
      return res.status(400).json({ error: 'Missing problemText or userAnswer.' });
    }

    const prompt = 'Problem: "' + problemText + '"\n\nStudent\'s answer: "' + userAnswer + '"\n\nDetermine if this answer is correct (allow for equivalent forms/reasonable rounding). Respond with ONLY raw JSON, no markdown fences: {"correct": true or false, "feedback": "one or two encouraging sentences explaining why, and if wrong, a nudge in the right direction without giving the answer away"}.';
    const system = 'You are grading a student answer for StudyBuddy. Respond with strict valid JSON only.';

    const raw = await callGemini(system, [{ type: 'text', text: prompt }]);
    const parsed = parseJSON(raw);
    res.json(parsed);
  } catch (err) {
    console.error('check-answer error:', err);
    res.status(500).json({ error: err.message || 'Failed to check the answer.' });
  }
});

const { exec } = require('child_process');

app.listen(PORT, () => {
  const url = 'http://localhost:' + PORT;
  console.log('StudyBuddy running at ' + url);
  if (!API_KEY) {
    console.log('   \u2192 Set GEMINI_API_KEY in a .env file to enable AI features.');
  }

  // Auto-open browser
  const startCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(startCmd + ' ' + url, (err) => {
    if (err) {
      console.warn('Failed to open browser automatically:', err.message);
    }
  });
});