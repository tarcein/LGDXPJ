// Each care event is a pickup/drop-off time, not the entire child's activity.
export function careTimeState(time: string | null | undefined, now: number): 'future' | 'active' | 'elapsed' {
  const startsAt = time ? Date.parse(time) : Number.NaN
  if (!Number.isFinite(startsAt) || now < startsAt) return 'future'
  return now < startsAt + 30 * 60_000 ? 'active' : 'elapsed'
}
