import thinqHomeMock from '../../../asset/thinq-home.png'
import thinqHomeSelectorMock from '../../../asset/thinq-home-selector.png'
import thinqHomeSelectorEmptyMock from '../../../asset/thinq-home-selector-empty.png'
import lockscreenWallpaper from '../../../asset/lockscreen-wallpaper.png'

export function ThinQEntry({ selectorOpen, hasFamily, onOpenSelector, onCloseSelector, onOpenService, onStartOnboarding }: {
  selectorOpen: boolean
  hasFamily: boolean
  onOpenSelector: () => void
  onCloseSelector: () => void
  onOpenService: () => void
  onStartOnboarding: () => void
}) {
  return <div className="thinq-entry-mock">
    <img src={selectorOpen ? (hasFamily ? thinqHomeSelectorMock : thinqHomeSelectorEmptyMock) : thinqHomeMock} alt="LG ThinQ 홈과 Family Care 진입 목업" />
    {!selectorOpen ? <>
      <button className="thinq-hotspot home-picker" aria-label="이지윤 홈 선택 열기" onClick={onOpenSelector} />
      <button className="thinq-hotspot family-learn" aria-label="Family Care 더 알아보기" onClick={onOpenService} />
    </> : <>
      <button className="thinq-hotspot selector-dismiss" aria-label="홈 선택 닫기" onClick={onCloseSelector} />
      <button className="thinq-hotspot current-home" aria-label="이지윤 홈 선택" onClick={onCloseSelector} />
      <button className="thinq-hotspot family-home" aria-label={hasFamily ? '민솔이네 집 Family Care 열기' : 'Family Care 가족방 지금 만들기'} onClick={hasFamily ? onOpenService : onStartOnboarding} />
    </>}
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
