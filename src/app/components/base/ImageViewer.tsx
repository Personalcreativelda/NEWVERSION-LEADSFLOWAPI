import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2, X } from 'lucide-react';
import { saveRemoteFile } from '../../lib/saveFile';

interface ImageViewerProps {
  src: string;
  /** Nome do ficheiro ao guardar */
  fileName?: string | null;
  onClose: () => void;
}

/**
 * Imagem em ecrã inteiro dentro do app (anexos das conversas), em vez de uma aba do
 * browser com o endereço do ficheiro. Fecha com ✕, Esc, botão voltar ou ao tocar fora.
 */
export function ImageViewer({ src, fileName, onClose }: ImageViewerProps) {
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onNativeBack = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    window.addEventListener('native-back', onNativeBack);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('native-back', onNativeBack);
    };
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    await saveRemoteFile(src, fileName);
    setSaving(false);
  };

  const iconButton = 'flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20';

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex justify-end gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" className={iconButton} aria-label="Guardar" disabled={saving}
          onClick={(e) => { e.stopPropagation(); void save(); }}>
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
        </button>
        <button type="button" className={iconButton} aria-label="Fechar" onClick={onClose}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <img src={src} alt="" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
      </div>
    </div>,
    document.body,
  );
}
