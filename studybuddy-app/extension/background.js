// StudyBuddy Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  // Create Context Menu for right-clicking highlighted text/code
  chrome.contextMenus.create({
    id: 'studybuddy-ask-hint',
    title: 'Ask StudyBuddy for a Hint',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'studybuddy-ask-hint' && info.selectionText) {
    const payload = {
      text: info.selectionText.trim(),
      pageTitle: tab.title || 'Selected Webpage',
      url: tab.url || '',
      timestamp: Date.now()
    };

    // Store pending selection so popup reads it when opened
    chrome.storage.local.set({ pending_selection: payload });
  }
});
