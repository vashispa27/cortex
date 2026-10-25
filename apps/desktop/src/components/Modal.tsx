import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import './modal.css';

type Props = {
  title: string; eyebrow?: string; onClose: () => void; children: ReactNode;
  /** Wide modals hold detail views; the default width suits short create/edit forms. */
  size?: 'default' | 'wide'; locked?: boolean;
};

/** Shared dialog: Escape and backdrop close it unless an action is in flight, and focus starts on the first field. */
export function Modal({ title, eyebrow, onClose, children, size = 'default', locked = false }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('input:not([type=hidden]), textarea, select, button:not(.cx-modal-close)')?.focus();
    return () => previous?.focus?.();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !locked) close.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked]);
  return <div className="modal-backdrop cx-modal-backdrop" role="presentation" onMouseDown={() => !locked && onClose()}>
    <div ref={panel} className={`modal cx-modal ${size === 'wide' ? 'cx-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}>
      <header className="cx-modal-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div><button type="button" className="icon-button cx-modal-close" aria-label="Close" disabled={locked} onClick={onClose}><X size={18}/></button></header>
      {children}
    </div>
  </div>;
}

export default Modal;
