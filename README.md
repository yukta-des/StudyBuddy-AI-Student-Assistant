# StudyBuddy — AI Student Assistant

An AI-powered learning assistant and Chrome extension that helps students solve coding, database, mathematics, and logical reasoning problems through guided hints instead of direct answers. The platform promotes active learning by combining adaptive AI assistance, Chrome tab screenshot capture, progress analytics, and a gamified achievement system.

---

## 🌟 Key Features

### 🧠 Intelligent Problem Analysis (Multimodal AI)
* **Text & Screenshot Capture:** Accepts text input or **one-click full-page screenshots (`📸 Take Screenshot of Page`)** directly from the Chrome Extension popup.
* **Powered by Google Gemini AI:** Automatically analyzes problem text and screenshot images.
* **Difficulty & Subject Classification:** Classifies question difficulty into three levels (Difficulty 1–3) and detects subjects (DSA, SQL, Logic Puzzles, Math).

### 💡 Progressive Hint System
* **Socratic-Style Hints:** Provides up to **5 progressive hints** that guide students toward the solution step-by-step without dumping direct answers.
* **Full Worked Solutions:** Offers option to view complete worked solutions when students need full walkthroughs.

### 🧩 Chrome Extension Integration
* **One-Click Tab Screenshot:** Capture a screenshot of any coding problem webpage (LeetCode, HackerRank, GeeksforGeeks, Codeforces) with a single click inside the extension popup.
* **Instant Sync:** Syncs problem analysis, progress, and hints seamlessly between the Chrome Extension and backend server.

### 📊 Learning Analytics
* **Performance Dashboard:** Tracks total solved questions, difficulty levels, and hint usage history.
* **Progress Tracking:** Records stats to help students improve problem-solving efficiency over time.

### 🏆 Achievement System
Unlocks after students solve **5 Difficulty-3 questions** and rewards consistent improvement across 5 progression stages:

* 🥉 **Bronze:** Solve 5 Difficulty 3 questions.
* 🥈 **Silver:** Solve 15 total questions + at least 3 Difficulty-3 questions using ≤ 2 hints.
* 🥇 **Gold:** Solve 25 total questions + at least 5 Difficulty-3 questions using exactly 1 hint.
* 💎 **Platinum:** Solve 30 total questions + at least 7 Difficulty-3 questions using 0 hints.
* 👑 **Master:** Solve 50 total questions + at least 10 Difficulty-3 questions using 0 hints.

---

## 🛠️ Quick Start & Setup

### 1. Backend Server Setup
```bash
# Navigate to app directory
cd studybuddy-app

# Install dependencies
npm install

# Create environment file
# Add your Gemini API Key from https://aistudio.google.com/app/apikey
echo "GEMINI_API_KEY=your_gemini_api_key_here" > .env

# Start the server
npm start
