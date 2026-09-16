export type Screen =
  | 'home' | 'careHub' | 'familyHub' | 'more' | 'family' | 'capture' | 'review' | 'assignments' | 'suggestion'
  | 'schedule' | 'exception' | 'tasks' | 'notifications'
  | 'members' | 'permissions' | 'plan' | 'chat' | 'emergency'
  | 'location' | 'album' | 'programs' | 'settings' | 'onboarding' | 'calendar' | 'gap'

export interface Family { id: string; name: string; plan: string }
export interface Member { id: string; name: string; role: string; status: string; is_owner: number }
export interface Child { id: string; name: string; age_label: string }
export interface Schedule { id: string; member_id: string; title: string; starts_at: string; ends_at: string; kind: 'WORK' | 'ROUTINE'; external_source: string | null }
export interface ChildSchedule { id: string; child_id: string; title: string; category: string; starts_at: string; ends_at: string; source: string }
export interface CareItem {
  id: string; intake_id: string | null; child_id: string | null; child_schedule_id?: string | null; item_type: string;
  title: string; detail: string; starts_at: string | null; confidence: string;
  status: string; created_at: string
}
export interface Assignment {
  id: string; item_id: string; assignee_id: string; status: string;
  source: string; note: string; completed_at: string | null; requested_by_member_id?: string | null
}
export interface CareException { id: string; assignment_id: string; reason: string; alternative_member_id: string; status: string }
export interface Handoff { id: string; assignment_id: string; from_member_id: string; to_member_id: string; briefing: string; special_note: string | null; status: string }
export interface Notice {
  id: string; title: string; body: string; level: string; member_id: string | null;
  is_read: number; created_at: string; action_type?: string | null; action_id?: string | null
}
export interface Permission { member_id: string; scope: string; is_allowed: number }
export interface NotificationPreference { member_id: string; app_enabled: number; daily_digest_enabled: number }
export interface Bootstrap {
  family: Family; members: Member[]; children: Child[]; schedules: Schedule[]; child_schedules: ChildSchedule[];
  items: CareItem[]; assignments: Assignment[]; exceptions: CareException[];
  handoffs: Handoff[]; notifications: Notice[]; permissions: Permission[]
  notification_preferences: NotificationPreference[]
}
export interface Suggestion { member_id: string; name: string; available: boolean; reason: string; priority: number }
export interface FamilyMe { family: Family; member: Member; authenticated: boolean }
export interface FamilySession { family_id: string; member_id: string; access_token: string; plan: string; invite_code?: string; invite_expires_at?: string }
export interface ChatAnswer { message: string; answer: string; usage: { total_tokens: number; used_today: number }; plan: string }
export interface EmergencyRequest { id: string; assignment_id: string; requested_by_member_id: string; claimed_by_member_id: string | null; reason: string; status: string; item_title: string }
export interface CalendarConnection { provider: 'google' | 'microsoft'; configured: boolean; api_key_configured?: boolean; connected: boolean; connected_at: string | null; synced_at: string | null }
export interface AlbumPhoto { id: string; child_id: string | null; assignment_id: string | null; kind: string; file_name: string; mime_type: string; data_url: string; caption: string; created_at: string }
export interface BenefitLocation { city: string; district: string; updated_at: string }
export interface Benefit {
  id: string; name: string; summary: string; category: string; organization: string; organization_type: string;
  target: string; content: string; criteria: string; deadline: string; method: string; contact: string;
  url: string; updated_at: string; scope: 'DISTRICT' | 'CITY' | 'NATIONAL'; region: string
}
export interface CareInstitution {
  id: string; name: string; city: string; district: string; service_area: string; phone: string; direct_phone: string;
  address: string; longitude: number | null; latitude: number | null; data_date: string
}
export interface HouseholdIncomeCriterion {
  year: string; grade: string; median_percent: number; household_size: number; monthly_income: number; data_date: string
}
export interface HealthInsuranceCriterion {
  year: string; income: number; employee_premium: number; regional_premium: number; mixed_premium: number; data_date: string
}
export interface EligibilityCriteria {
  year: string; data_date: string; household_income: HouseholdIncomeCriterion[];
  health_insurance: HealthInsuranceCriterion[]; disclaimer: string; source: string
}

const tokenKey = 'family-care-access-token'
export const hasFamilyToken = () => !!sessionStorage.getItem(tokenKey)
export const setFamilyToken = (token: string | null) => token ? sessionStorage.setItem(tokenKey, token) : sessionStorage.removeItem(tokenKey)

export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const token = sessionStorage.getItem(tokenKey)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
  })
  if (!response.ok) {
    let message = `요청에 실패했어요 (${response.status})`
    let code: string | undefined
    try {
      const body = await response.json()
      message = typeof body.detail === 'string' ? body.detail : body.detail?.message ?? message
      code = body.detail?.code
    } catch { /* use generic message */ }
    throw new ApiError(message, response.status, code)
  }
  return response.json() as Promise<T>
}

export const send = <T>(path: string, method: 'POST' | 'PATCH', payload: unknown = {}) =>
  api<T>(path, { method, body: JSON.stringify(payload) })

export const upload = <T>(path: string, form: FormData) => api<T>(path, { method: 'POST', body: form })

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
