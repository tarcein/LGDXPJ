export type Screen =
  | 'thinqHome' | 'thinqDevice' | 'thinqCare' | 'thinqMenu'
  | 'home' | 'family' | 'capture' | 'review' | 'assignments' | 'suggestion'
  | 'schedule' | 'exception' | 'handoff' | 'tasks' | 'notifications'
  | 'members' | 'permissions' | 'plan' | 'chat' | 'emergency'
  | 'location' | 'album' | 'programs' | 'settings' | 'onboarding' | 'calendar' | 'gap'

export interface Family { id: string; name: string; plan: string }
export interface Member { id: string; name: string; role: string; status: string; is_owner: number }
export interface Child { id: string; name: string; age_label: string }
export interface Schedule { id: string; member_id: string; title: string; starts_at: string; ends_at: string }
export interface CareItem {
  id: string; intake_id: string | null; child_id: string | null; item_type: string;
  title: string; detail: string; starts_at: string | null; confidence: string;
  status: string; created_at: string
}
export interface Assignment {
  id: string; item_id: string; assignee_id: string; status: string;
  source: string; note: string; completed_at: string | null
}
export interface CareException { id: string; assignment_id: string; reason: string; alternative_member_id: string; status: string }
export interface Handoff { id: string; assignment_id: string; to_member_id: string; briefing: string; status: string }
export interface Notice { id: string; title: string; body: string; level: string; member_id: string | null; is_read: number; created_at: string }
export interface Permission { member_id: string; scope: string; is_allowed: number }
export interface NotificationPreference { member_id: string; app_enabled: number; daily_digest_enabled: number }
export interface Bootstrap {
  family: Family; members: Member[]; children: Child[]; schedules: Schedule[];
  items: CareItem[]; assignments: Assignment[]; exceptions: CareException[];
  handoffs: Handoff[]; notifications: Notice[]; permissions: Permission[]
  notification_preferences: NotificationPreference[]
}
export interface Suggestion { member_id: string; name: string; available: boolean; reason: string; priority: number }

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    let message = `요청에 실패했어요 (${response.status})`
    try {
      const body = await response.json()
      message = typeof body.detail === 'string' ? body.detail : body.detail?.message ?? message
    } catch { /* use generic message */ }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

export const send = <T>(path: string, method: 'POST' | 'PATCH', payload: unknown = {}) =>
  api<T>(path, { method, body: JSON.stringify(payload) })

export function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(date)
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}
