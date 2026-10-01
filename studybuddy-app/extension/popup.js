(function () {
  let serverUrl = 'http://localhost:3000';
  let cq = null; // Current question state
  let busy = false;
  let extStats = { solvedCount: 0, history: [] };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Initialize Extension
  document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadStats();
    checkPendingSelection();
    wireNavigation();
    wireEvents();
  });

  // Settings Management
  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['serverUrl'], (res) => {
        if (res.serverUrl) {
          serverUrl = res.serverUrl.replace(/\/+$/, '');
          const input = $('#sb-server-url');
          if (input) input.value = serverUrl;
        }
        resolve();
      });
    });
  }

  function saveSettings() {
    const val = $('#sb-server-url').value.trim();
    if (!val) return;
    serverUrl = val.replace(/\/+$/, '');
    chrome.storage.local.set({ serverUrl }, () => {
      const status = $('#sb-settings-status');
      if (status) {
        status.textContent = 'Saved!';
        status.style.color = 'var(--green)';
        setTimeout(() => { status.textContent = ''; }, 2000);
      }
    });
  }

  // Load / Save Stats
  async function loadStats() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['ext_stats'], (res) => {
        if (res.ext_stats) extStats = res.ext_stats;
        resolve();
      });
    });
  }

  function saveStats() {
    chrome.storage.local.set({ ext_stats: extStats });
  }

  // Check if text was right-clicked via Context Menu
  function checkPendingSelection() {
    chrome.storage.local.get(['pending_selection'], (res) => {
      if (res.pending_selection && res.pending_selection.text) {
        const qtext = $('#sb-qtext');
        if (qtext) {
          qtext.value = res.pending_selection.text;
          setStatus('#sb-grab-status', 'Loaded selection from ' + escapeHtml(res.pending_selection.pageTitle), false);
        }
        // Clear pending selection once consumed
        chrome.storage.local.remove('pending_selection');
      }
    });
  }

  // Navigation
  function wireNavigation() {
    $$('#sb-nav button').forEach((btn) => {
      btn.onclick = () => {
        const tab = btn.dataset.tab;
        $$('#sb-nav button').forEach(b => b.classList.toggle('active', b === btn));
        ['solve', 'progress', 'settings'].forEach(t => {
          const el = $('#sb-tab-' + t);
          if (el) el.classList.toggle('sb-hidden', t !== tab);
        });
        if (tab === 'progress') renderProgress();
      };
    });
  }

  let capturedScreenshot = null; // { base64, mediaType }

  // Screenshot Capture
  async function takeTabScreenshot() {
    setStatus('#sb-grab-status', '<span class="sb-spinner"></span> Capturing screenshot...', false);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        setStatus('#sb-grab-status', 'No active tab found.', true);
        return;
      }

      if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
        setStatus('#sb-grab-status', 'Cannot screenshot system pages.', true);
        return;
      }

      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          console.error(chrome.runtime.lastError);
          setStatus('#sb-grab-status', 'Screenshot failed: ' + (chrome.runtime.lastError?.message || 'Permission denied'), true);
          return;
        }

        const cleanBase64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        capturedScreenshot = {
          base64: cleanBase64,
          mediaType: 'image/png'
        };

        const previewContainer = $('#sb-screenshot-preview');
        const imgEl = $('#sb-screenshot-img');
        if (imgEl) imgEl.src = dataUrl;
        if (previewContainer) previewContainer.classList.remove('sb-hidden');

        setStatus('#sb-grab-status', '✓ Screenshot captured!', false);
      });
    } catch (err) {
      console.error(err);
      setStatus('#sb-grab-status', 'Error capturing screenshot.', true);
    }
  }

  function clearScreenshot() {
    capturedScreenshot = null;
    const previewContainer = $('#sb-screenshot-preview');
    const imgEl = $('#sb-screenshot-img');
    if (imgEl) imgEl.src = '';
    if (previewContainer) previewContainer.classList.add('sb-hidden');
    setStatus('#sb-grab-status', '', false);
  }

  // API Call Helper
  async function apiPost(endpoint, body) {
    let res;
    try {
      res = await fetch(serverUrl + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw new Error('Cannot connect to server at ' + serverUrl + '. Make sure server is running (npm start).');
    }

    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error('Server response error (' + res.status + '). Check backend logs.');
    }

    if (!res.ok) {
      throw new Error(data.error || 'Server error (status ' + res.status + ')');
    }
    return data;
  }

  // Wire Button Events
  function wireEvents() {
    $('#sb-grab-btn').onclick = takeTabScreenshot;
    const clearBtn = $('#sb-clear-screenshot');
    if (clearBtn) clearBtn.onclick = clearScreenshot;

    $('#sb-save-settings').onclick = saveSettings;

    $('#sb-analyze').onclick = async () => {
      const text = $('#sb-qtext').value.trim();
      if (!text && !capturedScreenshot) {
        setStatus('#sb-analyze-status', 'Type a question or take a screenshot first.', true);
        return;
      }
      setStatus('#sb-analyze-status', '<span class="sb-spinner"></span> Analyzing...', false);

      try {
        const result = await apiPost('/api/analyze', {
          text: text,
          image: capturedScreenshot
        });
        cq = {
          problemText: result.problemText,
          subject: result.subject || 'Coding',
          difficulty: result.difficulty || 2,
          reasoning: result.reasoning || '',
          hints: [],
          hintsUsed: 0,
          solutionRevealed: false,
          solutionText: '',
          solved: false
        };
        setStatus('#sb-analyze-status', '', false);
        renderSolveActive();
      } catch (err) {
        console.error(err);
        setStatus('#sb-analyze-status', escapeHtml(err.message || 'Analysis failed.'), true);
      }
    };

    $('#sb-newq').onclick = resetSolveScreen;
    $('#sb-another').onclick = resetSolveScreen;
    $('#sb-gethint').onclick = onGetHint;
    $('#sb-reveal').onclick = onRevealSolution;
    $('#sb-checkans').onclick = onCheckAnswer;
  }

  // Solve Screen Controller
  function resetSolveScreen() {
    cq = null;
    clearScreenshot();
    $('#sb-qtext').value = '';
    setStatus('#sb-grab-status', '', false);
    setStatus('#sb-analyze-status', '', false);
    $('#sb-intake-card').classList.remove('sb-hidden');
    $('#sb-active-card').classList.add('sb-hidden');
    $('#sb-answer-card').classList.add('sb-hidden');
    $('#sb-solved-banner').classList.add('sb-hidden');
  }

  function renderSolveActive() {
    if (!cq) return;
    $('#sb-intake-card').classList.add('sb-hidden');
    $('#sb-active-card').classList.remove('sb-hidden');
    $('#sb-answer-card').classList.remove('sb-hidden');

    const diffTag = $('#sb-diff-tag');
    diffTag.textContent = 'Difficulty ' + cq.difficulty + (cq.subject ? ' · ' + cq.subject : '');
    diffTag.className = 'sb-diff-stamp sb-diff-' + cq.difficulty;

    $('#sb-prob-text').textContent = cq.problemText;
    $('#sb-prob-reason').textContent = cq.reasoning ? 'Why: ' + cq.reasoning : '';

    renderTicks();
    renderHints();
    renderSolution();

    const getHintBtn = $('#sb-gethint');
    if (getHintBtn) getHintBtn.style.display = (cq.hintsUsed < 5 && !cq.solved) ? 'inline-block' : 'none';
  }

  function renderTicks() {
    const ticksContainer = $('#sb-ticks');
    ticksContainer.innerHTML = [1, 2, 3, 4, 5].map(n =>
      '<div class="sb-tick ' + (n <= cq.hintsUsed ? 'used' : '') + '">H' + n + '</div>'
    ).join('');
  }

  function renderHints() {
    const container = $('#sb-hints-container');
    container.innerHTML = cq.hints.map((h, i) =>
      '<div class="sb-hint-card"><span class="hn">Hint ' + (i + 1) + '</span>' + escapeHtml(h) + '</div>'
    ).join('');
  }

  function renderSolution() {
    const container = $('#sb-solution-container');
    if (cq.solutionRevealed) {
      container.innerHTML = '<div class="sb-solution-card"><b>Full Worked Solution:</b>\n' + escapeHtml(cq.solutionText) + '</div>';
    } else {
      container.innerHTML = '';
    }
  }

  async function onGetHint() {
    if (busy || !cq) return;
    busy = true;
    setStatus('#sb-hint-status', '<span class="sb-spinner"></span>', false);

    try {
      const nextN = cq.hintsUsed + 1;
      const res = await apiPost('/api/hint', {
        problemText: cq.problemText,
        hintNumber: nextN,
        previousHints: cq.hints
      });
      cq.hints.push(res.hint);
      cq.hintsUsed = nextN;
      setStatus('#sb-hint-status', '', false);
      renderSolveActive();
    } catch (err) {
      console.error(err);
      setStatus('#sb-hint-status', escapeHtml(err.message || 'Failed hint call.'), true);
    } finally { busy = false; }
  }

  async function onRevealSolution() {
    if (busy || !cq) return;
    busy = true;
    setStatus('#sb-hint-status', '<span class="sb-spinner"></span>', false);

    try {
      const res = await apiPost('/api/solution', { problemText: cq.problemText });
      cq.solutionText = res.solution;
      cq.solutionRevealed = true;
      if (cq.hintsUsed < 5) cq.hintsUsed = 5;
      setStatus('#sb-hint-status', '', false);
      renderSolveActive();
    } catch (err) {
      console.error(err);
      setStatus('#sb-hint-status', escapeHtml(err.message || 'Failed solution call.'), true);
    } finally { busy = false; }
  }

  async function onCheckAnswer() {
    if (busy || !cq) return;
    const ans = $('#sb-answer').value.trim();
    if (!ans) {
      setStatus('#sb-answer-status', 'Enter answer to check.', true);
      return;
    }
    busy = true;
    setStatus('#sb-answer-status', '<span class="sb-spinner"></span>', false);

    try {
      const res = await apiPost('/api/check-answer', {
        problemText: cq.problemText,
        userAnswer: ans
      });
      setStatus('#sb-answer-status', '', false);
      const fb = $('#sb-answer-feedback');
      fb.innerHTML = '<div class="sb-feedback ' + (res.correct ? 'correct' : 'incorrect') + '">' + escapeHtml(res.feedback || '') + '</div>';

      if (res.correct) {
        cq.solved = true;
        extStats.solvedCount++;
        extStats.history.push({
          problemText: cq.problemText.slice(0, 40) + '...',
          difficulty: cq.difficulty,
          hintsUsed: cq.hintsUsed,
          time: Date.now()
        });
        saveStats();
        $('#sb-answer-card').classList.add('sb-hidden');
        $('#sb-solved-banner').classList.remove('sb-hidden');
        $('#sb-solved-meta').textContent = 'Solved with ' + cq.hintsUsed + ' hint' + (cq.hintsUsed === 1 ? '' : 's') + ' at Difficulty ' + cq.difficulty + '.';
      }
    } catch (err) {
      console.error(err);
      setStatus('#sb-answer-status', escapeHtml(err.message || 'Error checking answer.'), true);
    } finally { busy = false; }
  }

  // Progress Render
  function renderProgress() {
    const summary = $('#sb-stats-summary');
    if (summary) {
      summary.innerHTML = '<div style="display:flex; justify-content:space-around; text-align:center; padding:8px 0;">' +
        '<div><div style="font-size:20px; font-weight:bold; color:var(--brand);">' + extStats.solvedCount + '</div><div style="font-size:10px; color:var(--text-dim);">Problems Solved</div></div>' +
        '</div>';
    }

    const recent = $('#sb-recent-list');
    if (recent) {
      if (!extStats.history.length) {
        recent.innerHTML = '<p style="font-size:11px; color:#888;">No solved problems yet.</p>';
      } else {
        recent.innerHTML = extStats.history.slice(-5).reverse().map(h =>
          '<div style="font-size:11px; margin-bottom:4px; padding-bottom:4px; border-bottom:1px solid #2C323B;">' +
          '<span>' + escapeHtml(h.problemText) + '</span> ' +
          '<span style="color:#8A97A8; font-size:10px;">(D' + h.difficulty + ' · ' + h.hintsUsed + ' hints)</span>' +
          '</div>'
        ).join('');
      }
    }
  }

  // Utilities
  function setStatus(sel, html, isError) {
    const el = $(sel);
    if (el) {
      el.innerHTML = html;
      el.style.color = isError ? 'var(--red)' : 'var(--text-dim)';
    }
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
