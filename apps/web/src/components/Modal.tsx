import { useEffect } from 'react';
import { Hud, HudTag } from './Hud';

interface ModalProps {
  /** Короткая HUD-метка вида `// system.tag`. */
  tag: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Дополнительные классы панели (например, ширина). */
  className?: string;
  /**
   * Закрывать по Escape (по умолчанию true). Для вложенных модалок
   * передавай false, чтобы Escape закрывал только верхний фрейм.
   */
  closeOnEscape?: boolean;
}

/**
 * Общий модальный wrapper в стиле HUD-темы: затемнённый фон, панель с
 * неоновыми уголками, заголовок и кнопка закрытия. Закрывается по Escape
 * и клику на фон. Появление — анимация в стиле темы (см. index.css).
 */
export function Modal({
  tag,
  title,
  onClose,
  children,
  className = 'max-w-md',
  closeOnEscape = true,
}: ModalProps) {
  useEffect(() => {
    if (!closeOnEscape) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, closeOnEscape]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      <div
        className="modal-backdrop fixed inset-0 bg-night/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 flex min-h-full items-center justify-center p-4">
        <Hud
          className={`modal-panel flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-visible rounded-lg border border-edge bg-panel p-5 shadow-[0_0_30px_rgba(255,46,136,0.15)] ${className}`}
        >
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <HudTag>{tag}</HudTag>
              <h2 className="mt-2 font-display text-lg text-ghost">{title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="shrink-0 text-mute transition-colors hover:text-ghost"
            >
              ✕
            </button>
          </div>
          <div className="modal-scroll mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>
        </Hud>
      </div>
    </div>
  );
}