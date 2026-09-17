import thinqFloorPlan from '../../../asset/thinq-floor-plan.png'
import homeTabIcon from '../../../bar_asset/Vector.png'
import deviceTabIcon from '../../../asset/Group 5.png'
import careTabIcon from '../../../asset/Group 7.png'
import menuTabIcon from '../../../bar_asset/Vector-1.png'
import lockscreenWallpaper from '../../../asset/lockscreen-wallpaper.png'
import { AssistantLogo } from './AppChrome'

type HomeSelectorProps = {
  hasFamily: boolean
  onClose: () => void
  onSelectThinQHome: () => void
  onSelectFamily: () => void
  onStartOnboarding: () => void
}

export function ThinQHomeSelector({ hasFamily, onClose, onSelectThinQHome, onSelectFamily, onStartOnboarding }: HomeSelectorProps) {
  return <div className="thinq-selector-shade" onClick={onClose}><section className="thinq-selector-sheet" role="dialog" aria-modal="true" aria-label="홈 선택" onClick={event => event.stopPropagation()}><i /><header><h2>홈 선택</h2><button aria-label="홈 선택 닫기" onClick={onClose}>×</button></header><button className="thinq-selected-home" onClick={onSelectThinQHome}><b>✓</b><span><strong>우리 집</strong><small>ThinQ 홈으로 이동</small></span></button><h3>Family Care</h3><button className="thinq-family-home" onClick={hasFamily ? onSelectFamily : onStartOnboarding}><AssistantLogo /><span><strong>{hasFamily ? 'Family Care 가족방' : '가족방 지금 만들기'}</strong><small>{hasFamily ? '가족 일정과 돌봄 현황 보기' : '가족을 초대하고 돌봄을 시작해보세요'}</small></span><b>›</b></button></section></div>
}

export function ThinQEntry({ selectorOpen, hasFamily, onOpenSelector, onCloseSelector, onOpenService, onStartOnboarding }: {
  selectorOpen: boolean
  hasFamily: boolean
  onOpenSelector: () => void
  onCloseSelector: () => void
  onOpenService: () => void
  onStartOnboarding: () => void
}) {
  const navItems = [['홈', homeTabIcon], ['디바이스', deviceTabIcon], ['케어', careTabIcon], ['메뉴', menuTabIcon]]
  return <div className="thinq-entry">
    <header className="thinq-app-header"><button className="thinq-home-picker" onClick={onOpenSelector}>우리 집 <span>⌄</span></button><div><button aria-label="제품 추가">＋</button><button aria-label="알림">●</button><button aria-label="더보기">⋮</button></div></header>
    <main className="thinq-home-content">
      <button className="thinq-agent-banner" onClick={onOpenService}><AssistantLogo /><span><strong>가족의 돌봄을 알아서 조율해드려요</strong><small>Family Care로 일정과 역할을 함께 관리해보세요</small><b>더 알아보기 ›</b></span></button>
      <section className="thinq-floor-card" aria-label="우리 집 평면도"><img src={thinqFloorPlan} alt="침실과 거실이 표시된 우리 집 평면도" /><span>연결된 공간 5개</span></section>
      <section className="thinq-favorites"><div><h2>즐겨 찾는 제품</h2><button>편집</button></div><article><p>자주 사용하는 제품을 추가하면<br />홈에서 바로 확인할 수 있어요.</p><button>＋ 제품 추가</button></article></section>
      <button className="thinq-play-card"><span>▷</span><div><strong>ThinQ PLAY</strong><small>우리 집을 더 편리하게 만드는 새로운 기능</small></div><b>›</b></button>
    </main>
    <button className="thinq-family-fab" aria-label="Family Care 열기" onClick={onOpenService}><AssistantLogo /></button>
    <nav className="thinq-bottom-nav" aria-label="ThinQ 주요 메뉴">{navItems.map(([label, icon], index) => <button key={label} className={index === 0 ? 'active' : ''}><img src={icon} alt="" /><span>{label}</span></button>)}</nav>
    {selectorOpen && <ThinQHomeSelector hasFamily={hasFamily} onClose={onCloseSelector} onSelectThinQHome={onCloseSelector} onSelectFamily={onOpenService} onStartOnboarding={onStartOnboarding} />}
  </div>
}

export function ServiceLoading() {
  return <div className="service-loading" role="status" aria-live="polite"><span className="service-loading-mark">F</span><strong>Family Care</strong><p>가족의 오늘을 불러오고 있어요</p><i /></div>
}

export function LockscreenPreview({ onOpen, onClose }: { onOpen: () => void; onClose: () => void }) {
  return <div className="lockscreen-mock">
    <img src={lockscreenWallpaper} alt="" />
    <div className="lockscreen-dim" />
    <div className="lockscreen-date"><strong>15:20</strong><span>9월 16일 화요일</span></div>
    <section className="lockscreen-live-card">
      <div className="lockscreen-live-head"><span className="live-avatar">할</span><div><strong>민솔 · 이동 중</strong><small>실시간</small></div></div>
      <div className="lockscreen-route-line"><span className="done">✓</span><i /><span>2</span><i /><span>3</span><i /><span>4</span></div>
      <div className="lockscreen-route-labels"><span>학교</span><span>방과후</span><span>태권도</span><span>집</span></div>
      <strong className="lockscreen-route-title">할머니와 함께 태권도로 이동 중</strong>
      <p>다음 목적지까지 10분</p>
      <button onClick={onOpen}>자세히 ›</button>
    </section>
    <p className="lockscreen-privacy">앱을 열지 않아도 인계 상태만 보입니다.<br />정확한 좌표는 표시하지 않습니다.</p>
    <button className="lockscreen-close" aria-label="잠금화면 미리보기 닫기" onClick={onClose}>×</button>
  </div>
}
