import thinqFloorPlan from '../../../asset/thinq/figma-floor-plan.png'
import thinqAgent from '../../../asset/thinq/figma-agent.png'
import thinqAgentFab from '../../../asset/thinq/figma-agent-fab.png'
import productPlusBackground from '../../../asset/thinq/figma-product-plus.svg'
import thinqHomeTitle from '../../../asset/home_asset/ThinQ_home_이지윤홈.png'
import thinqHomeTab from '../../../asset/home_asset/ThinQ_home_홈탭.png'
import thinqDeviceTab from '../../../asset/home_asset/ThinQ_home_디바이스탭.png'
import thinqCareTab from '../../../asset/home_asset/ThinQ_home_케어탭.png'
import thinqMenuTab from '../../../asset/home_asset/ThinQ_home_메뉴탭.png'
import thinqHomeCheck from '../../../asset/home_asset/ThinQ_home_서비스접속_홈체크.png'
import thinqFamilyRoom from '../../../asset/home_asset/ThinQ_home_서비스접속_가족방.png'
import thinqHeaderActions from '../../../asset/home_asset/우측상단버튼들.png'
import serviceLoading1 from '../../../asset/home_asset/로딩1.png'
import serviceLoading2 from '../../../asset/home_asset/로딩2.png'
import serviceLoading3 from '../../../asset/home_asset/로딩3.png'
import lockscreenWallpaper from '../../../asset/lockscreen-wallpaper.png'
import routeDoneNode from '../../../asset/잠금화면_동선/실행완료일정.png'
import routeDoneLine from '../../../asset/잠금화면_동선/실행완료동선.png'
import routeActiveNode from '../../../asset/잠금화면_동선/실행중일정.png'
import routeActiveLine from '../../../asset/잠금화면_동선/실행중동선.png'
import routeFutureNode from '../../../asset/잠금화면_동선/잠금화면동선_실행전일정.png'
import routeFutureLine from '../../../asset/잠금화면_동선/실행전동선.png'
import lockscreenDetail from '../../../asset/잠금화면_동선/자세히 ›.png'

type HomeSelectorProps = {
  hasFamily: boolean
  onClose: () => void
  onSelectThinQHome: () => void
  onSelectFamily: () => void
  onStartOnboarding: () => void
  familyName?: string
}

export function ThinQHomeSelector({ hasFamily, onClose, onSelectThinQHome, onSelectFamily, onStartOnboarding, familyName = '민솔이네 집' }: HomeSelectorProps) {
  return <div className="thinq-selector-shade" onClick={onClose}><section className="thinq-selector-sheet" role="dialog" aria-modal="true" aria-label="홈 선택" onClick={event => event.stopPropagation()}><i /><header><h2>홈 선택</h2></header><button className="thinq-selected-home" onClick={onSelectThinQHome}><img src={thinqHomeCheck} alt="선택됨" /><strong>이지윤 홈</strong></button><h3>Family Care</h3><button className="thinq-family-home" onClick={hasFamily ? onSelectFamily : onStartOnboarding}><img src={thinqFamilyRoom} alt="" /><strong>{hasFamily ? familyName : '+ 지금 만들기'}</strong></button></section></div>
}

function ThinQAgentMark() {
  return <span className="thinq-agent-mark" aria-hidden="true"><img src={thinqAgent} alt="" /></span>
}

export function ThinQEntry({ selectorOpen, hasFamily, onOpenSelector, onCloseSelector, onOpenService, onStartOnboarding, familyName = '민솔이네 집' }: {
  selectorOpen: boolean
  hasFamily: boolean
  onOpenSelector: () => void
  onCloseSelector: () => void
  onOpenService: () => void
  onStartOnboarding: () => void
  familyName?: string
}) {
  const navItems = [{ label: '홈', icon: thinqHomeTab, className: 'home' }, { label: '디바이스', icon: thinqDeviceTab, className: 'device' }, { label: '케어', icon: thinqCareTab, className: 'care' }, { label: '메뉴', icon: thinqMenuTab, className: 'menu' }]
  return <div className="thinq-entry">
    <header className="thinq-app-header"><button className="thinq-home-picker" aria-label="이지윤 홈 선택" onClick={onOpenSelector}><img src={thinqHomeTitle} alt="" /></button><button className="thinq-header-actions" aria-label="제품 추가, 알림, 더보기"><img src={thinqHeaderActions} alt="" /></button></header>
    <main className="thinq-home-content">
      <button className="thinq-agent-banner" onClick={onOpenService}><ThinQAgentMark /><span><strong><span>가족의 돌봄을 알아서 조율하고 이어주는</span><br />family agent를 만나보세요.</strong><b>더 알아보기</b></span></button>
      <section className="thinq-floor-card" aria-label="이지윤 홈 평면도"><img src={thinqFloorPlan} alt="침실과 거실이 표시된 이지윤 홈 평면도" /></section>
      <section className="thinq-favorites"><div><h2>즐겨 찾는 제품</h2></div><article><p>제품을 추가하고 즐겨 찾는 제품으로 배치하면 홈 화면에서 바로 사용<br />할 수 있어요.</p><button><span><img src={productPlusBackground} alt="" />＋</span>제품 추가</button></article></section>
    </main>
    <button className="thinq-family-fab" aria-label="ThinQ 도우미"><img src={thinqAgentFab} alt="" /></button>
    <nav className="thinq-bottom-nav" aria-label="ThinQ 주요 메뉴">{navItems.map((item, index) => <button key={item.label} aria-current={index === 0 ? 'page' : undefined} className={index === 0 ? 'active' : ''}><span className={`thinq-nav-asset ${item.className}`}><img src={item.icon} alt="" />{item.className === 'care' && <small>케어</small>}</span></button>)}</nav>
    {selectorOpen && <ThinQHomeSelector hasFamily={hasFamily} familyName={familyName} onClose={onCloseSelector} onSelectThinQHome={onCloseSelector} onSelectFamily={onOpenService} onStartOnboarding={onStartOnboarding} />}
  </div>
}

export function ServiceLoading() {
  return <div className="service-loading" role="status" aria-live="polite"><span className="service-loading-character">{[serviceLoading1, serviceLoading2, serviceLoading3].map((source, index) => <img key={source} src={source} alt="" style={{ animationDelay: `${index * .32}s` }} />)}</span><strong>Family Care</strong><p>가족의 오늘을 불러오고 있어요</p><i /></div>
}

export function LockscreenPreview({ onOpen }: { onOpen: () => void }) {
  return <div className="lockscreen-mock">
    <img src={lockscreenWallpaper} alt="" />
    <div className="lockscreen-date"><strong>15:20</strong><span>9월 16일 화요일</span></div>
    <section className="lockscreen-live-card">
      <div className="lockscreen-live-head"><span /><strong>민솔 · 이동 중</strong><small>실시간</small></div>
      <div className="lockscreen-route-track"><span className="lockscreen-route-stop"><img src={routeDoneNode} alt="학교 완료" /><small>학교</small></span><img className="lockscreen-route-segment" src={routeDoneLine} alt="" /><span className="lockscreen-route-stop"><img src={routeDoneNode} alt="방과후 완료" /><small>방과후</small></span><img className="lockscreen-route-segment" src={routeActiveLine} alt="" /><span className="lockscreen-route-stop active"><img src={routeActiveNode} alt="태권도 진행 중" /><small>태권도</small></span><img className="lockscreen-route-segment" src={routeFutureLine} alt="" /><span className="lockscreen-route-stop future"><img src={routeFutureNode} alt="집 도착 전" /><small>집</small></span></div>
      <div className="lockscreen-route-current"><span /><strong>할머니와 함께 태권도로 이동 중</strong></div>
      <footer><p>다음 목적지까지 10분</p><button aria-label="오늘의 배정 자세히 보기" onClick={onOpen}><img src={lockscreenDetail} alt="자세히" /></button></footer>
    </section>
    <p className="lockscreen-privacy">앱을 열지 않아도 인계 상태만 보입니다.<br />정확한 좌표는 표시하지 않습니다.</p>
  </div>
}
