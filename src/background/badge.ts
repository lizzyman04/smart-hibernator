export async function updateBadge(count: number): Promise<void> {
  const text = count <= 0 ? '' : count >= 1000 ? '999+' : String(count)
  await chrome.action.setBadgeText({ text })
  if (count > 0) {
    await chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' })
  }
}
