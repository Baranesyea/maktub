// Weekly email backup: the writer's books as plain text, sent by Maktub's server function.
import { isMock } from '@/lib/utils'

export const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

/** Ask the server to email this writer a full copy right now. */
export async function sendBackupNow() {
  if (isMock) {
    await new Promise((r) => setTimeout(r, 400))
    return { ok: true, sent: 1 }
  }
  const { base44 } = await import('@/api/base44Client')
  const res = await base44.functions.invoke('emailBackup', { mode: 'me' })
  return res?.data || res
}
