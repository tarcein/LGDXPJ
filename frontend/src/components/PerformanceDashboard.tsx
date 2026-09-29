import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { api, type PerformanceMetric, type PerformanceSummary } from '../api'

type Tracker = 'BX' | 'CX' | 'DX'

const trackerMeta: Record<Tracker, { label: string; description: string; color: string }> = {
  BX: { label: '비즈니스 성장', description: '가족방 유입과 Pro 전환', color: '#cf163f' },
  CX: { label: '고객 경험', description: '활성·유지·확인 행동', color: '#5d5bd7' },
  DX: { label: '돌봄 실행', description: '배정부터 완료까지', color: '#0d9488' },
}

const metricMeta: Record<string, { name: string; unit: string; target: string; targetValue?: number; lowerIsBetter?: boolean }> = {
  'BX-01': { name: '신규 가족방', unit: '가족', target: '전 기간 대비 증가' },
  'BX-02': { name: '초대 링크당 참여 인원', unit: '명/링크', target: '1명 이상', targetValue: 1 },
  'BX-03': { name: 'Pro 전환율', unit: '%', target: '베타 10% 이상', targetValue: 10 },
  'BX-04': { name: 'Paywall → Pro 시작', unit: '%', target: '25% 이상', targetValue: 25 },
  'BX-05': { name: 'Pro 시작 → 결제', unit: '%', target: '15% 이상', targetValue: 15 },
  'BX-06': { name: '한도 도달 후 결제 전환', unit: '%', target: '기능별 추이 확인' },
  'BX-07': { name: '기간 내 결제 매출', unit: '원', target: '월별 증가' },
  'BX-08': { name: '활성 구독 비중', unit: '%', target: '90% 이상', targetValue: 90 },
  'CX-01': { name: '월간 활성 가족방', unit: '가족', target: '전월 대비 증가' },
  'CX-02': { name: '월간 활성 구성원', unit: '명', target: '전월 대비 증가' },
  'CX-03': { name: 'D+7 리텐션', unit: '%', target: '40% 이상', targetValue: 40 },
  'CX-04': { name: 'D+30 리텐션', unit: '%', target: '25% 이상', targetValue: 25 },
  'CX-05': { name: '첫 가치 도달 시간', unit: '분', target: '10분 이내', targetValue: 10, lowerIsBetter: true },
  'CX-06': { name: '알림 확인율', unit: '%', target: '70% 이상', targetValue: 70 },
  'CX-07': { name: 'AI 채널 사용 비율', unit: '%', target: '70% 이상', targetValue: 70 },
  'CX-08': { name: '인수인계 확인율', unit: '%', target: '95% 이상', targetValue: 95 },
  'CX-09': { name: '가전 알림 활성 가족방', unit: '가족', target: '월별 증가' },
  'CX-10': { name: '가전 알림 D+30 유지율', unit: '%', target: '6주 데이터 후 기준 설정' },
  'CX-11': { name: '주간 재방문율', unit: '%', target: '40% 이상', targetValue: 40 },
  'DX-01': { name: '가족방당 주간 일정', unit: '건', target: '주 3건 이상', targetValue: 3 },
  'DX-02': { name: 'OCR 알림장 등록', unit: '건', target: '주간 이용 가족 증가' },
  'DX-03': { name: '충돌 → 재배정 완료', unit: '분', target: '평균 4분 이내', targetValue: 4, lowerIsBetter: true },
  'DX-04': { name: 'AI 담당자 추천 채택률', unit: '%', target: '60% 이상', targetValue: 60 },
  'DX-05': { name: '배정 요청 응답률', unit: '%', target: '80% 이상', targetValue: 80 },
  'DX-06': { name: '돌봄 완료율', unit: '%', target: '90% 이상', targetValue: 90 },
  'DX-07': { name: '구성원당 AI 질문', unit: '건', target: '월 3건 이상', targetValue: 3 },
  'DX-08': { name: 'Pro 가전 알림 활성화율', unit: '%', target: '30% 이상', targetValue: 30 },
}

const eventLabel: Record<string, string> = {
  app_opened: '앱 실행', screen_view: '화면 조회', schedule_created: '일정 등록', conflict_detected: '일정 충돌 감지',
  ai_candidate_suggested: 'AI 담당자 추천', request_sent: '배정 요청', request_responded: '배정 응답',
  reassignment_confirmed: '재배정 확정', manual_adjustment_used: '수동 조정', assignment_completed: '돌봄 완료',
  handoff_completed: '인수인계 완료', handoff_viewed: '인수인계 조회', handoff_acknowledged: '인수인계 확인',
  notification_sent: '알림 발송', notification_opened: '알림 확인', chatbot_query: 'AI 질문',
  chatbot_response_delivered: 'AI 응답', chatbot_action_opened: 'AI 제안 실행', device_alert_used: '가전 알림 설정',
  device_alert_presented: '가전 알림 노출', family_created: '가족방 생성', invite_created: '초대 생성',
  invite_accepted: '초대 수락', feature_limit_reached: '기능 한도 도달', limit_reached_screen_viewed: '한도 안내 조회',
  pro_paywall_viewed: 'Pro 안내 조회', pro_cta_clicked: 'Pro 시작 클릭', payment_completed: '결제 완료',
  payment_abandoned: '결제 이탈', pro_feature_used: 'Pro 기능 사용', subscription_renewed: '구독 갱신',
  subscription_cancelled: '구독 해지',
}

const formatMetricValue = (metric: PerformanceMetric) => {
  if (metric.value == null) return '데이터 대기'
  const meta = metricMeta[metric.id]
  const number = meta?.unit === '원'
    ? Math.round(metric.value).toLocaleString('ko-KR')
    : Number.isInteger(metric.value) ? metric.value.toLocaleString('ko-KR') : metric.value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })
  return `${number}${meta?.unit === '%' ? '%' : meta?.unit ? ` ${meta.unit}` : ''}`
}

function MetricCard({ metric }: { metric: PerformanceMetric }) {
  const meta = metricMeta[metric.id] ?? { name: metric.name, unit: metric.unit, target: metric.target }
  const hasValue = metric.value != null
  const targetMet = hasValue && meta.targetValue != null
    ? meta.lowerIsBetter ? metric.value! <= meta.targetValue : metric.value! >= meta.targetValue
    : null
  const progress = !hasValue ? 0 : meta.targetValue
    ? Math.min(100, Math.max(4, meta.lowerIsBetter ? meta.targetValue / Math.max(metric.value!, 0.01) * 100 : metric.value! / meta.targetValue * 100))
    : Math.min(100, Math.max(7, metric.value!))
  return <article className="performance-metric-card">
    <div className="performance-metric-head"><span>{metric.id}</span>{targetMet != null && <em className={targetMet ? 'met' : 'tracking'}>{targetMet ? '목표 달성' : '추적 중'}</em>}</div>
    <strong>{meta.name}</strong>
    <div className={'performance-metric-value ' + (!hasValue ? 'empty' : '')}>{formatMetricValue(metric)}</div>
    <div className="performance-progress" aria-label={`${meta.name} 목표 진행`}><i style={{ width: `${progress}%` }} /></div>
    <small>목표 · {meta.target}</small>
    {metric.denominator != null && <p>{(metric.numerator ?? 0).toLocaleString()} / {metric.denominator.toLocaleString()}건 기준</p>}
  </article>
}

export function PerformanceDashboard() {
  const [days, setDays] = useState(30)
  const [tracker, setTracker] = useState<Tracker>('CX')
  const [summary, setSummary] = useState<PerformanceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      setSummary(await api<PerformanceSummary>(`/performance/summary?days=${days}&scope=service`))
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '대시보드를 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    let active = true
    document.title = 'ZIPPY Performance · Developer Console'
    api<PerformanceSummary>(`/performance/summary?days=${days}&scope=service`)
      .then(result => { if (active) { setSummary(result); setError('') } })
      .catch(reason => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : '대시보드를 불러오지 못했어요.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [days])
  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(() => void load(true), 5_000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, load])

  const events = useMemo(() => Object.entries(summary?.event_counts ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 8), [summary])
  const totalEvents = Object.values(summary?.event_counts ?? {}).reduce((sum, count) => sum + count, 0)
  const maxEvent = events[0]?.[1] || 1
  const updatedAt = summary ? new Date(summary.generated_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'

  return <main className="performance-web-shell">
    <header className="performance-web-nav"><div><i>Z</i><span><strong>ZIPPY</strong><small>Developer Console</small></span></div><span className="performance-web-scope"><i /> 전체 서비스</span></header>
    <section className="performance-dashboard">
    <header className="performance-hero">
      <div><span className="performance-eyebrow">PERFORMANCE TRACKER</span><h2>성과가 쌓이는 순간을<br />바로 확인해요</h2></div>
      <button className={'performance-live ' + (autoRefresh ? 'active' : '')} onClick={() => setAutoRefresh(value => !value)} aria-pressed={autoRefresh}><i />{autoRefresh ? 'LIVE' : 'PAUSED'}</button>
      <p>실제 사용 이벤트를 기반으로 <strong>BX · CX · DX</strong> 지표를 5초마다 갱신합니다.</p>
    </header>

    <div className="performance-controls">
      <div className="performance-period" aria-label="조회 기간">{[7, 30, 90].map(value => <button key={value} className={days === value ? 'active' : ''} onClick={() => setDays(value)}>{value}일</button>)}</div>
      <div className="performance-data-range"><span>DATA SCOPE</span><strong>전체 서비스 통합 집계</strong></div>
    </div>

    {error && <div className="performance-error"><strong>개발자 지표를 불러오지 못했어요</strong><span>{error}</span></div>}
    <div className="performance-overview">
      <article><span>누적 이벤트</span><strong>{totalEvents.toLocaleString()}</strong><small>선택 기간 내</small></article>
      <article><span>측정 지표</span><strong>{summary ? Object.values(summary.trackers).flat().length : 0}</strong><small>BX · CX · DX</small></article>
      <article><span>마지막 갱신</span><strong>{updatedAt}</strong><small>{autoRefresh ? '5초 자동 갱신' : '자동 갱신 중지'}</small></article>
    </div>

    <nav className="performance-tracker-tabs" aria-label="성과 지표 분류">{(Object.keys(trackerMeta) as Tracker[]).map(key => <button key={key} className={tracker === key ? 'active' : ''} style={{ '--tracker-color': trackerMeta[key].color } as CSSProperties} onClick={() => setTracker(key)}><b>{key}</b><span>{trackerMeta[key].label}</span><small>{summary?.trackers[key].filter(metric => metric.value != null).length ?? 0}/{summary?.trackers[key].length ?? 0}</small></button>)}</nav>

    <div className="performance-section-title"><div><span>{tracker}</span><h3>{trackerMeta[tracker].label}</h3><p>{trackerMeta[tracker].description}</p></div><button disabled={loading} onClick={() => void load()}>{loading ? '불러오는 중' : '↻ 새로고침'}</button></div>
    <div className="performance-metric-grid">{summary?.trackers[tracker].map(metric => <MetricCard key={metric.id} metric={metric} />)}</div>
    {!summary && loading && <div className="performance-loading"><i /><span>성과 데이터를 집계하고 있어요</span></div>}

    <section className="performance-events">
      <div className="performance-section-title compact"><div><span>EVENT LOG</span><h3>가장 많이 쌓인 행동</h3><p>선택 기간의 실사용 이벤트 상위 8개</p></div></div>
      {events.length ? <div className="performance-event-list">{events.map(([name, count]) => <div key={name}><header><span>{eventLabel[name] ?? name}</span><strong>{count.toLocaleString()}건</strong></header><div><i style={{ width: `${Math.max(5, count / maxEvent * 100)}%` }} /></div></div>)}</div> : <div className="performance-empty">앱을 사용하면 이벤트가 이곳에 바로 쌓입니다.</div>}
    </section>
    <footer className="performance-privacy">일정 제목·대화·메모·주소·사진은 수집하지 않고, 지표 산출에 필요한 행동과 상태만 기록합니다.</footer>
    </section>
  </main>
}
