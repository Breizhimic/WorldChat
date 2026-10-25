import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Dialog({ title, children, onClose, busy = false }: {
  title: string; children: ReactNode; onClose?: () => void; busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="dialog-title" onCancel={(event) => {
      event.preventDefault();
      if (!busy) onClose?.();
    }}>
      <div className="dialog-header">
        <h2 id="dialog-title">{title}</h2>
        {onClose && <button className="icon-button" disabled={busy} onClick={onClose} aria-label="Fermer"><Icon name="close" /></button>}
      </div>
      {children}
    </dialog>
  );
}
