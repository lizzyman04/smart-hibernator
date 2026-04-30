const WATCHED_SELECTORS = 'input, textarea, select'

function reportFormActivity(): void {
  chrome.runtime.sendMessage({
    type: 'FORM_ACTIVITY',
    timestamp: Date.now(),
  }).catch(() => {
    // SW may be starting up; message is best-effort
  })
}

document.addEventListener('keydown', (e) => {
  if ((e.target as Element)?.matches(WATCHED_SELECTORS)) {
    reportFormActivity()
  }
})

document.addEventListener('input', (e) => {
  if ((e.target as Element)?.matches(WATCHED_SELECTORS)) {
    reportFormActivity()
  }
})
