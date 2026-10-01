// StudyBuddy Content Script - Extracts code/problem text from active browser tab

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_PAGE_CONTEXT') {
    const context = extractPageContext();
    sendResponse(context);
  }
  return true; // async response support
});

function extractPageContext() {
  const pageTitle = document.title || 'Webpage';
  const url = window.location.href;

  // 1. Prioritize user's active highlight/selection
  const selectionText = window.getSelection() ? window.getSelection().toString().trim() : '';
  if (selectionText) {
    return {
      type: 'selection',
      text: selectionText,
      pageTitle,
      url
    };
  }

  // 2. Smart auto-detect problem text for popular coding platforms
  let problemText = '';

  // LeetCode
  const leetCodeEl = document.querySelector('[data-track-load="description_content"]') ||
                     document.querySelector('.content__u2vh') ||
                     document.querySelector('[class*="description"]');
  if (leetCodeEl) {
    problemText = leetCodeEl.innerText.trim();
  }

  // HackerRank
  if (!problemText) {
    const hrEl = document.querySelector('.problem-description') || document.querySelector('.challenge-body-html');
    if (hrEl) problemText = hrEl.innerText.trim();
  }

  // GeeksforGeeks
  if (!problemText) {
    const gfgEl = document.querySelector('.problem-statement') || document.querySelector('.entry-content');
    if (gfgEl) {
      let rawText = gfgEl.innerText.trim();
      // Filter out top metadata banner if present
      rawText = rawText.replace(/^Difficulty:[\s\S]*?Average Time:\s*\w+/i, '').trim();
      problemText = rawText || gfgEl.innerText.trim();
    }
  }

  // Codeforces
  if (!problemText) {
    const cfEl = document.querySelector('.problem-statement');
    if (cfEl) problemText = cfEl.innerText.trim();
  }

  // Generic fallback: look for main or article text, truncated if needed
  if (!problemText) {
    const mainEl = document.querySelector('main') || document.querySelector('article') || document.body;
    if (mainEl) {
      problemText = mainEl.innerText.trim();
      if (problemText.length > 2000) {
        problemText = problemText.slice(0, 2000) + '...';
      }
    }
  }

  return {
    type: 'auto_detect',
    text: problemText,
    pageTitle,
    url
  };
}
