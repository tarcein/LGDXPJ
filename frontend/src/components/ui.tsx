import type { ReactNode } from 'react'

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return <div className={`card ${className}`.trim()} onClick={onClick}>{children}</div>
}

export function Section({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="section-heading"><span>{children}</span>{action}</div>
}

export function Empty({ title, text }: { title: string; text: string }) {
  return <Card className="empty"><span className="empty-glyph">✓</span><strong>{title}</strong><p>{text}</p></Card>
}

export function Pro() {
  return <span className="pro-badge">PRO</span>
}

export function BottomSheet({ children, className = '', onDismiss }: { children: ReactNode; className?: string; onDismiss: () => void }) {
  return <div className="sheet-overlay" onClick={onDismiss}><section className={`bottom-sheet ${className}`.trim()} role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}><div className="sheet-handle" />{children}</section></div>
}
