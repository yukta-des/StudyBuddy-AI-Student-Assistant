(function () {
  const STORAGE_KEY = 'studybuddy_questions';

  let state = { questions: [] };
  let cq = null; // current question in progress
  let inputMode = 'text';
  let uploadedImage = null; // { base64, mediaType, name }
  let busy = false;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // ---------- persistence (browser localStorage) ----------
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore, start fresh */ }
    return { questions: [] };
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.error('Save failed', e); }
  }

  // ---------- backend calls ----------
  async function apiPost(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function analyzeQuestion(text, image) {
    return apiPost('/api/analyze', { text: text || '', image: image || null });
  }
  async function getHint(problemText, hintNumber, previousHints) {
    const r = await apiPost('/api/hint', { problemText, hintNumber, previousHints });
    return r.hint;
  }
  async function getSolution(problemText) {
    const r = await apiPost('/api/solution', { problemText });
    return r.solution;
  }
  async function checkAnswer(problemText, userAnswer) {
    return apiPost('/api/check-answer', { problemText, userAnswer });
  }

  // ---------- stats & achievements ----------
  function computeStats() {
    const solved = state.questions.filter(q => q.solved !== false);
    const totalSolved = solved.length;
    const d3 = solved.filter(q => q.difficulty === 3);
    const d3Count = d3.length;
    const d3LE2 = d3.filter(q => q.hintsUsed <= 2).length;
    const d3Eq1 = d3.filter(q => q.hintsUsed === 1).length;
    const d3Eq0 = d3.filter(q => q.hintsUsed === 0).length;

    const unlocked = d3Count >= 5;
    let stage = 'None';
    if (unlocked) {
      stage = 'Bronze';
      if (totalSolved >= 15 && d3LE2 >= 3) stage = 'Silver';
      if (totalSolved >= 25 && d3Eq1 >= 5) stage = 'Gold';
      if (totalSolved >= 30 && d3Eq0 >= 7) stage = 'Platinum';
      if (totalSolved >= 50 && d3Eq0 >= 10) stage = 'Master';
    }
    return { totalSolved, d3Count, d3LE2, d3Eq1, d3Eq0, unlocked, stage };
  }

  const STAGE_REQS = {
    Bronze: { label: 'Solve 5 questions at Difficulty 3.', check: s => [['Difficulty-3 solved: ' + s.d3Count + '/5', s.d3Count >= 5]] },
    Silver: { label: 'Solve 15 total + at least 3 Diff-3 questions using \u22642 hints.', check: s => [['Total solved: ' + s.totalSolved + '/15', s.totalSolved >= 15], ['Diff-3 with \u22642 hints: ' + s.d3LE2 + '/3', s.d3LE2 >= 3]] },
    Gold: { label: 'Solve 25 total + at least 5 Diff-3 questions using exactly 1 hint.', check: s => [['Total solved: ' + s.totalSolved + '/25', s.totalSolved >= 25], ['Diff-3 with 1 hint: ' + s.d3Eq1 + '/5', s.d3Eq1 >= 5]] },
    Platinum: { label: 'Solve 30 total + at least 7 Diff-3 questions using 0 hints.', check: s => [['Total solved: ' + s.totalSolved + '/30', s.totalSolved >= 30], ['Diff-3 with 0 hints: ' + s.d3Eq0 + '/7', s.d3Eq0 >= 7]] },
    Master: { label: 'Solve 50 total + at least 10 Diff-3 questions using 0 hints.', check: s => [['Total solved: ' + s.totalSolved + '/50', s.totalSolved >= 50], ['Diff-3 with 0 hints: ' + s.d3Eq0 + '/10', s.d3Eq0 >= 10]] }
  };

  // ---------- rendering ----------
  function medalClass(stage) { return 'medal-' + (stage || 'none').toLowerCase(); }
  function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

  function renderHome() {
    const s = computeStats();
    const root = $('#sb-tab-home');
    const order = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Master'];
    let nextStage;
    if (!s.unlocked) nextStage = 'Bronze';
    else {
      const idx = order.indexOf(s.stage);
      nextStage = idx < order.length - 1 ? order[idx + 1] : null;
    }

    let progressHtml = '';
    if (!s.unlocked) {
      progressHtml = '<p style="font-size:13px;color:#5b5442;margin:14px 0 4px;">Solve <b>5 Difficulty-3</b> questions to unlock the achievement system.</p>' +
        '<div class="sb-progress-track"><div class="sb-progress-fill" style="width:' + Math.min(100, s.d3Count / 5 * 100) + '%"></div></div>' +
        '<p style="font-size:12px;color:#7a725c;margin:4px 0 0;">' + s.d3Count + ' / 5 Difficulty-3 solved</p>';
    } else if (nextStage) {
      const reqs = STAGE_REQS[nextStage].check(s);
      progressHtml = '<p style="font-size:13px;color:#5b5442;margin:14px 0 6px;">Next: <b>' + nextStage + '</b> \u2014 ' + STAGE_REQS[nextStage].label + '</p>' +
        reqs.map(r => '<div style="font-size:12px;color:#7a725c;margin-bottom:6px;">' + r[0] + (r[1] ? ' \u2713' : '') + '</div>').join('');
    } else {
      progressHtml = '<p style="font-size:13px;color:#5b5442;margin:14px 0 4px;">\uD83C\uDFC6 You\'ve reached the top stage \u2014 Master. Keep solving to stay sharp!</p>';
    }

    root.innerHTML =
      '<div class="sb-card">' +
        '<p class="sb-eyebrow">Your Progress</p>' +
        '<div class="sb-stage-row">' +
          '<div class="sb-medal ' + (s.unlocked ? '' : 'locked') + ' ' + medalClass(s.stage) + '"><span>' + (s.unlocked ? s.stage : 'Locked') + '</span></div>' +
          '<div class="sb-stage-info">' +
            '<h3>' + (s.unlocked ? s.stage + ' Tier' : 'System Locked') + '</h3>' +
            '<p>' + (s.unlocked ? 'Keep solving to climb the ranks.' : 'Solve Difficulty-3 problems to unlock achievements.') + '</p>' +
          '</div>' +
        '</div>' +
        progressHtml +
        '<div class="sb-stat-grid">' +
          '<div class="sb-stat"><div class="num">' + s.totalSolved + '</div><div class="lbl">Solved</div></div>' +
          '<div class="sb-stat"><div class="num">' + s.d3Count + '</div><div class="lbl">Diff-3 solved</div></div>' +
          '<div class="sb-stat"><div class="num">' + s.d3Eq0 + '</div><div class="lbl">0-hint (D3)</div></div>' +
          '<div class="sb-stat"><div class="num">' + s.d3Eq1 + '</div><div class="lbl">1-hint (D3)</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="sb-row"><button class="sb-btn" id="sb-home-newq">Start a New Question \u2192</button></div>' +
      (state.questions.length ? renderRecentLog() : '') +
      (state.questions.length ? '<div class="sb-reset-row"><button id="sb-reset-progress">Reset all progress</button></div>' : '');

    $('#sb-home-newq').onclick = () => { resetSolveScreen(); switchTab('solve'); };
    const resetBtn = $('#sb-reset-progress');
    if (resetBtn) resetBtn.onclick = () => {
      if (confirm('This clears all solved questions and achievement progress. Continue?')) {
        state = { questions: [] };
        saveState();
        renderHome(); renderAchievements();
      }
    };
  }

  function renderRecentLog() {
    const recent = state.questions.slice(-6).reverse();
    return '<div class="sb-card-dark">' +
      '<p class="sb-eyebrow">Recent Activity</p>' +
      recent.map(q =>
        '<div class="sb-log-item"><span class="txt">' + escapeHtml(q.problemText.slice(0, 50)) + (q.problemText.length > 50 ? '\u2026' : '') + '</span>' +
        '<span class="meta">D' + q.difficulty + ' \u00B7 ' + q.hintsUsed + ' hint' + (q.hintsUsed === 1 ? '' : 's') + '</span></div>'
      ).join('') +
      '</div>';
  }

  function renderAchievements() {
    const s = computeStats();
    const root = $('#sb-tab-achievements');
    const order = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Master'];
    const currentIdx = order.indexOf(s.stage);

    let html = '';
    if (!s.unlocked) {
      html += '<div class="sb-locked-banner">' +
        '<div class="sb-medal locked medal-none" style="margin:0 auto 10px;"><span>Locked</span></div>' +
        '<p style="font-size:13px;color:var(--text-dim);margin:0 0 6px;">Solve <b style="color:var(--text-light)">5 Difficulty-3</b> problems to unlock the achievement system.</p>' +
        '<div class="sb-progress-track" style="max-width:240px;margin:8px auto 0;background:var(--ink-softer);"><div class="sb-progress-fill" style="width:' + Math.min(100, s.d3Count / 5 * 100) + '%"></div></div>' +
        '<p style="font-size:12px;color:var(--text-dim);margin:6px 0 0;">' + s.d3Count + ' / 5</p>' +
        '</div>';
    }

    html += '<div class="sb-medal-case">';
    order.forEach((stage, i) => {
      const achieved = s.unlocked && i <= currentIdx;
      const reqs = STAGE_REQS[stage].check(s);
      html += '<div class="sb-medal-slot ' + (achieved && stage === s.stage ? 'current' : '') + '">' +
        '<div class="sb-medal ' + (achieved ? '' : 'locked') + ' ' + medalClass(stage) + '" style="margin:0 auto;width:56px;height:56px;"><span style="font-size:9px;">' + (achieved ? '\u2713' : '\uD83D\uDD12') + '</span></div>' +
        '<h4>' + stage + '</h4>' +
        '<ul class="req">' + reqs.map(r => '<li class="' + (r[1] ? 'done' : '') + '">' + r[0] + (r[1] ? ' \u2713' : '') + '</li>').join('') + '</ul>' +
        '</div>';
    });
    html += '</div>';
    root.innerHTML = html;
  }

  // ---------- solve screen ----------
  function resetSolveScreen() {
    cq = null;
    uploadedImage = null;
    inputMode = 'text';
    renderSolve();
  }

  function renderSolve() {
    const root = $('#sb-tab-solve');
    if (!cq) {
      root.innerHTML = solveIntakeHtml();
      wireIntake();
    } else {
      root.innerHTML = solveActiveHtml();
      wireActive();
    }
  }

  function solveIntakeHtml() {
    return '<div class="sb-card">' +
      '<p class="sb-eyebrow">New Problem</p>' +
      '<h2 class="sb-h2">What are you working on?</h2>' +
      '<div class="sb-input-tabs">' +
        '<button data-mode="text" class="' + (inputMode === 'text' ? 'active' : '') + '">Type it</button>' +
        '<button data-mode="image" class="' + (inputMode === 'image' ? 'active' : '') + '">Upload image</button>' +
      '</div>' +
      (inputMode === 'text'
        ? '<textarea class="sb-textarea" id="sb-qtext" placeholder="Paste or type the question here\u2026"></textarea>'
        : '<label class="sb-file-drop" id="sb-filedrop">' +
          (uploadedImage ? ('<img class="sb-img-preview" src="data:' + uploadedImage.mediaType + ';base64,' + uploadedImage.base64 + '"/>')
            : '\uD83D\uDCF7 Click to upload a screenshot or photo of the problem') +
          '<input type="file" accept="image/*" id="sb-fileinput" style="display:none;"/>' +
          '</label>' +
          '<textarea class="sb-textarea" id="sb-qtext" style="min-height:60px;margin-top:10px;" placeholder="Optional note or context\u2026"></textarea>'
      ) +
      '<div class="sb-row" style="margin-top:14px;">' +
        '<button class="sb-btn" id="sb-analyze">Analyze Problem</button>' +
        '<span id="sb-analyze-status"></span>' +
      '</div>' +
      '</div>';
  }

  function wireIntake() {
    $$('.sb-input-tabs button').forEach(b => b.onclick = () => { inputMode = b.dataset.mode; renderSolve(); });
    const drop = $('#sb-filedrop');
    if (drop) {
      drop.onclick = () => $('#sb-fileinput').click();
      $('#sb-fileinput').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const base64 = await fileToBase64(file);
        uploadedImage = { base64, mediaType: file.type || 'image/png', name: file.name };
        renderSolve();
      };
    }
    $('#sb-analyze').onclick = async () => {
      const text = $('#sb-qtext') ? $('#sb-qtext').value.trim() : '';
      if (inputMode === 'text' && !text) { setStatus('#sb-analyze-status', 'Type a question first.', true); return; }
      if (inputMode === 'image' && !uploadedImage) { setStatus('#sb-analyze-status', 'Upload an image first.', true); return; }
      setStatus('#sb-analyze-status', '<span class="sb-spinner"></span> Analyzing\u2026', false);
      try {
        const result = await analyzeQuestion(text, inputMode === 'image' ? uploadedImage : null);
        cq = {
          problemText: result.problemText,
          subject: result.subject || '',
          difficulty: result.difficulty,
          reasoning: result.reasoning || '',
          hints: [],
          hintsUsed: 0,
          solutionRevealed: false,
          solutionText: '',
          solved: false
        };
        renderSolve();
      } catch (err) {
        console.error(err);
        setStatus('#sb-analyze-status', escapeHtml(err.message || 'Something went wrong. Try again.'), true);
      }
    };
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function setStatus(sel, html, isError) {
    const el = $(sel);
    if (el) el.innerHTML = '<span style="font-size:12.5px;color:' + (isError ? 'var(--red)' : 'var(--text-dim)') + ';margin-left:8px;">' + html + '</span>';
  }

  function solveActiveHtml() {
    const diffClass = 'sb-diff-' + cq.difficulty;
    const ticks = [1, 2, 3, 4, 5].map(n => {
      const used = n <= cq.hintsUsed;
      return '<div class="sb-tick ' + (used ? 'used' : '') + '">H' + n + '</div>';
    }).join('');

    const hintCards = cq.hints.map((h, i) => '<div class="sb-hint-card"><span class="hn">Hint ' + (i + 1) + '</span>' + escapeHtml(h) + '</div>').join('');
    const solutionCard = cq.solutionRevealed
      ? '<div class="sb-solution-card"><b style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--amber-deep);display:block;margin-bottom:6px;">Full Solution</b>' + escapeHtml(cq.solutionText) + '</div>'
      : '';

    const canHint = cq.hintsUsed < 5 && !cq.solved;
    const canReveal = !cq.solutionRevealed && !cq.solved;

    return '<div class="sb-card">' +
      '<div class="sb-row" style="justify-content:space-between;">' +
        '<span class="sb-diff-stamp ' + diffClass + '">Difficulty ' + cq.difficulty + (cq.subject ? ' \u00B7 ' + escapeHtml(cq.subject) : '') + '</span>' +
        '<button class="sb-btn sb-btn-ghost sb-btn-sm" id="sb-newq" style="color:#7a725c;border-color:var(--paper-line);">New question</button>' +
      '</div>' +
      '<p style="font-size:14.5px;line-height:1.55;margin:14px 0 4px;">' + escapeHtml(cq.problemText) + '</p>' +
      (cq.reasoning ? '<p style="font-size:11.5px;color:#8a8267;margin:0 0 10px;">Why: ' + escapeHtml(cq.reasoning) + '</p>' : '') +
      '<div class="sb-ruler">' + ticks + '</div>' +
      hintCards +
      solutionCard +
      '<div class="sb-row" style="margin-top:6px;">' +
        (canHint ? '<button class="sb-btn" id="sb-gethint">Get a Hint (' + cq.hintsUsed + '/5)</button>' : '') +
        (canReveal ? '<button class="sb-btn sb-btn-outline" id="sb-reveal">Show Full Solution</button>' : '') +
        '<span id="sb-hint-status"></span>' +
      '</div>' +
      '</div>' +
      (!cq.solved ? answerBoxHtml() : solvedBannerHtml());
  }

  function answerBoxHtml() {
    return '<div class="sb-card">' +
      '<p class="sb-eyebrow">Your Answer</p>' +
      '<textarea class="sb-textarea" id="sb-answer" style="min-height:70px;" placeholder="Type your answer here\u2026"></textarea>' +
      '<div class="sb-row" style="margin-top:10px;">' +
        '<button class="sb-btn sb-btn-dark" id="sb-checkans">Check My Answer</button>' +
        '<span id="sb-answer-status"></span>' +
      '</div>' +
      '<div id="sb-answer-feedback"></div>' +
      '</div>';
  }

  function solvedBannerHtml() {
    return '<div class="sb-card" style="border:2px solid #4C8C4A;">' +
      '<p class="sb-eyebrow" style="color:#3d7a3b;">Solved \u2713</p>' +
      '<p style="font-size:13.5px;margin:4px 0 12px;">Logged with ' + cq.hintsUsed + ' hint' + (cq.hintsUsed === 1 ? '' : 's') + ' at Difficulty ' + cq.difficulty + '.</p>' +
      '<button class="sb-btn" id="sb-another">Solve Another Question</button>' +
      '</div>';
  }

  function wireActive() {
    $('#sb-newq').onclick = () => { resetSolveScreen(); };
    const hintBtn = $('#sb-gethint');
    if (hintBtn) hintBtn.onclick = onGetHint;
    const revealBtn = $('#sb-reveal');
    if (revealBtn) revealBtn.onclick = () => revealSolution();
    const checkBtn = $('#sb-checkans');
    if (checkBtn) checkBtn.onclick = onCheckAnswer;
    const anotherBtn = $('#sb-another');
    if (anotherBtn) anotherBtn.onclick = () => { resetSolveScreen(); };
  }

  async function onGetHint() {
    if (busy) return;
    busy = true;
    setStatus('#sb-hint-status', '<span class="sb-spinner"></span> Thinking of a hint\u2026', false);
    try {
      const nextN = cq.hintsUsed + 1;
      const hint = await getHint(cq.problemText, nextN, cq.hints);
      cq.hints.push(hint);
      cq.hintsUsed = nextN;
      renderSolve();
      if (nextN === 4 || nextN === 5) showHintPopup(nextN);
    } catch (err) {
      console.error(err);
      setStatus('#sb-hint-status', escapeHtml(err.message || 'Could not fetch a hint. Try again.'), true);
    } finally { busy = false; }
  }

  function showHintPopup(n) {
    const overlay = document.createElement('div');
    overlay.className = 'sb-modal-overlay';
    overlay.innerHTML = '<div class="sb-modal">' +
      '<div style="font-size:34px;">' + (n === 5 ? '\uD83D\uDEDF' : '\u26A0\uFE0F') + '</div>' +
      '<h3>' + (n === 5 ? 'Last hint used' : 'Second-to-last hint used') + '</h3>' +
      '<p>You\'ve used hint ' + n + ' of 5. Want to see the full worked solution now, or keep trying on your own?</p>' +
      '<div class="sb-row" style="justify-content:center;">' +
        '<button class="sb-btn" id="sb-modal-reveal">Show Solution</button>' +
        '<button class="sb-btn sb-btn-outline" id="sb-modal-dismiss">Keep Trying</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    $('#sb-modal-dismiss', overlay).onclick = () => overlay.remove();
    $('#sb-modal-reveal', overlay).onclick = () => { overlay.remove(); revealSolution(); };
  }

  async function revealSolution() {
    if (busy) return;
    busy = true;
    setStatus('#sb-hint-status', '<span class="sb-spinner"></span> Preparing the solution\u2026', false);
    try {
      const sol = await getSolution(cq.problemText);
      cq.solutionText = sol;
      cq.solutionRevealed = true;
      if (cq.hintsUsed < 5) cq.hintsUsed = 5;
      renderSolve();
    } catch (err) {
      console.error(err);
      setStatus('#sb-hint-status', escapeHtml(err.message || 'Could not fetch the solution. Try again.'), true);
    } finally { busy = false; }
  }

  async function onCheckAnswer() {
    if (busy) return;
    const ans = $('#sb-answer').value.trim();
    if (!ans) { setStatus('#sb-answer-status', 'Type an answer first.', true); return; }
    busy = true;
    setStatus('#sb-answer-status', '<span class="sb-spinner"></span> Checking\u2026', false);
    try {
      const result = await checkAnswer(cq.problemText, ans);
      const fb = $('#sb-answer-feedback');
      fb.innerHTML = '<div class="sb-feedback ' + (result.correct ? 'correct' : 'incorrect') + '">' + escapeHtml(result.feedback || '') + '</div>';
      setStatus('#sb-answer-status', '', false);
      if (result.correct) await markSolved();
    } catch (err) {
      console.error(err);
      setStatus('#sb-answer-status', escapeHtml(err.message || 'Could not check that. Try again.'), true);
    } finally { busy = false; }
  }

  async function markSolved() {
    cq.solved = true;
    const before = computeStats().stage;
    state.questions.push({
      problemText: cq.problemText,
      difficulty: cq.difficulty,
      hintsUsed: cq.hintsUsed,
      timestamp: Date.now()
    });
    saveState();
    const after = computeStats().stage;
    renderSolve();
    if (after !== before) setTimeout(() => showStageUpPopup(after), 350);
  }

  function showStageUpPopup(stage) {
    const overlay = document.createElement('div');
    overlay.className = 'sb-modal-overlay';
    overlay.innerHTML = '<div class="sb-modal">' +
      '<div class="sb-medal ' + medalClass(stage) + '" style="margin:0 auto 6px;width:88px;height:88px;"><span style="font-size:12px;">' + stage + '</span></div>' +
      '<h3>' + stage + ' Unlocked!</h3>' +
      '<p>You just leveled up your StudyBuddy rank. Check the Achievements tab for what\'s next.</p>' +
      '<div class="sb-row" style="justify-content:center;">' +
        '<button class="sb-btn" id="sb-stageup-ok">Nice!</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    $('#sb-stageup-ok', overlay).onclick = () => overlay.remove();
  }

  // ---------- nav ----------
  function switchTab(tab) {
    $$('#sb-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    ['home', 'solve', 'achievements'].forEach(t => $('#sb-tab-' + t).classList.toggle('sb-hidden', t !== tab));
    if (tab === 'home') renderHome();
    if (tab === 'solve') renderSolve();
    if (tab === 'achievements') renderAchievements();
  }

  $$('#sb-nav button').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

  // ---------- init ----------
  state = loadState();
  renderHome();
  renderSolve();
  renderAchievements();
})();
