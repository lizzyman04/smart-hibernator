export function createContextMenus(): void {
  chrome.contextMenus.create({
    id: 'hibernate-tab',
    title: 'Hibernate this tab',
    contexts: ['page', 'action'],
  })
  chrome.contextMenus.create({
    id: 'protect-tab',
    title: 'Protect this tab from hibernation',
    contexts: ['page', 'action'],
  })
}
