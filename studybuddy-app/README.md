# StudyBuddy

An AI study assistant: analyzes a question's difficulty (1–3), gives up to 5
progressive hints, checks your answer, and tracks progress through
Bronze → Silver → Gold → Platinum → Master achievements.

## How it's built

- **`server.js`** — a small Express server. It holds your Gemini API key
  and proxies four endpoints (`/api/analyze`, `/api/hint`, `/api/solution`,
  `/api/check-answer`) to Google Gemini. Your key never reaches the browser.
- **`public/`** — the frontend (plain HTML/CSS/JS, no build step). It calls
  the endpoints above and stores your solved-question history in the
  browser's `localStorage`, so progress persists between visits on the same
  machine/browser.

## Setup

1. **Install dependencies** (requires internet access):
   ```bash
   npm install
   ```

2. **Add your API key.** Copy the example env file and fill it in:
   ```bash
   cp .env.example .env
   ```
   Then open `.env` and set:
   ```
   GEMINI_API_KEY=AIzaSy...
   ```
   Get a key from https://aistudio.google.com/ if you don't have one yet.

3. **Run it:**
   ```bash
   npm start
   ```
   Then open **http://localhost:3000** in your browser.

   (`npm run dev` restarts the server automatically when you edit `server.js`.)

## Notes

- Progress is stored per-browser via `localStorage`, not on the server. If
  you clear browser data or switch browsers, progress resets. There's a
  "Reset all progress" link on the Home tab to clear it manually.
- Image uploads are sent to the backend as base64 and forwarded to Gemini for
  transcription + difficulty analysis — no image is stored anywhere.
- The default model is `gemini-2.5-flash`; override it by setting
  `GEMINI_MODEL` in `.env` if you want to use a different model.
- Achievement rules:
  - **System unlock:** 3 questions solved.
  - **Bronze:** 3 questions solved.
  - **Silver:** 7 total solved + ≥2 questions solved using ≤2 hints + Challenge: Solve 1 DSA question.
  - **Gold:** 12 total solved + ≥4 questions solved using ≤1 hint + Challenge: Solve 1 SQL question with ≤1 hint.
  - **Platinum:** 20 total solved + ≥6 questions solved using 0 hints + Challenge: Solve at least 3 DSA and 3 SQL questions.
  - **Master:** 30 total solved + ≥10 questions solved using 0 hints + Challenge: Solve at least one of each category (DSA, SQL, Puzzle) with 0 hints.
