import type { Screen } from '../api'
import assistantMainLogo from '../../../asset/assistant-main-logo-centered.png'
import calendarTabIcon from '../../../bar_asset/twotone-calendar-month.png'
import careTabIcon from '../../../bar_asset/baseline-child-care.png'
import homeTabIcon from '../../../bar_asset/Vector.png'
import familyTabIcon from '../../../bar_asset/Group 19.png'
import moreTabIcon from '../../../bar_asset/Vector-1.png'
import bellIcon from '../../../asset/알림아이콘.png'
import serviceSwitchIcon from '../../../asset/서비스이동토글.png'

type ChromeProps = {
  screen: Screen
  familyName: string
  memberName: string
  profileColor: string
  contextLine?: string
  unread: number
  onNavigate: (screen: Screen) => void
  onOpenThinQHomes: () => void
}

export function MobileStatusBar() {
  return <div className="mobile-status" aria-hidden="true" />
}

export function AppHeader({ familyName, memberName, profileColor, contextLine, unread, onNavigate, onOpenThinQHomes }: ChromeProps) {
  return <header className="app-header">
    <button className="family-switcher" aria-label={`${familyName} 홈 선택`} onClick={onOpenThinQHomes}>
      <strong>{familyName}</strong><img className="service-switch-icon" src={serviceSwitchIcon} alt="" /><small>{contextLine || 'Family Care'}</small>
    </button>
    <button className="header-bell" aria-label="알림함" onClick={() => onNavigate('notifications')}><img src={bellIcon} alt="" />{unread > 0 && <i>{unread}</i>}</button>
    <button className="header-profile" aria-label={`${memberName || '내'} 정보 공개 설정`} onClick={() => onNavigate('permissions')}><span style={{ background: profileColor }}>{(memberName || '나').trim().slice(0, 1)}</span></button>
  </header>
}

const navItems: { screen: Screen; label: string; icon: string; className?: string; active: Screen[] }[] = [
  { screen: 'home', label: '홈', icon: homeTabIcon, active: ['home'] },
  { screen: 'careHub', label: '케어', icon: careTabIcon, active: ['careHub', 'assignments', 'assignmentDetail', 'suggestion', 'tasks', 'exception', 'emergency'] },
  { screen: 'schedule', label: '일정', icon: calendarTabIcon, active: ['schedule', 'calendar', 'capture', 'review', 'family', 'supplies'] },
  { screen: 'familyHub', label: '가족', icon: familyTabIcon, className: 'family-icon', active: ['familyHub', 'members', 'permissions', 'album'] },
  { screen: 'more', label: '더보기', icon: moreTabIcon, active: ['more', 'notifications', 'settings', 'gap', 'programs', 'plan'] },
]

export function BottomNav({ screen, onNavigate }: Pick<ChromeProps, 'screen' | 'onNavigate'>) {
  return <nav className="bottom-nav" aria-label="Family Care 주요 메뉴">{navItems.map(item => {
    const active = item.active.includes(screen)
    return <button key={item.screen} aria-current={active ? 'page' : undefined} className={active ? 'active' : ''} onClick={() => onNavigate(item.screen)}>
      <span className={`nav-icon ${item.className ?? ''}`.trim()} style={{ WebkitMaskImage: `url("${item.icon}")`, maskImage: `url("${item.icon}")` }} />{item.label}
    </button>
  })}</nav>
}

export function AssistantLogo({ className = '' }: { className?: string }) {
  return <img className={`assistant-logo ${className}`.trim()} src={assistantMainLogo} alt="" />
}

export function FloatingAssistant({ onOpen }: { onOpen: () => void }) {
  return <button className="floating-assistant" aria-label="케어 어시스턴트 열기" onClick={onOpen}><AssistantLogo /></button>
}
