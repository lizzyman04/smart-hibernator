import { ALARM_NAME } from '../shared/constants'

export async function ensureHibernateAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(ALARM_NAME)
  if (!existing) {
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 })
  }
}
