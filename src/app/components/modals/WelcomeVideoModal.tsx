import { X, Play, Star } from 'lucide-react';

interface WelcomeVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFeedback: () => void;
}

export default function WelcomeVideoModal({ isOpen, onClose, onOpenFeedback }: WelcomeVideoModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4 animate-fadeIn">
      <div
        className="relative w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl border-t sm:border shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        {/* Header */}
        <div
          className="px-4 sm:px-6 py-3 sm:py-4 border-b flex items-center justify-between"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <div>
            <h2 className="text-base sm:text-lg font-bold" style={{ color: 'hsl(var(--foreground))' }}>
              👋 Bem-vindo à LeadsFlow!
            </h2>
            <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Veja o que você pode fazer com a plataforma
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-muted/50 flex-shrink-0"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video — 16:9 responsive */}
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            className="absolute inset-0 w-full h-full"
            src="https://www.youtube.com/embed/IyZXXVLKKXY?si=VYHz4OytWzef_Hm7&autoplay=1&mute=1"
            title="LeadsFlow - Conheça a plataforma"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>

        {/* Footer */}
        <div
          className="px-4 sm:px-6 py-3 sm:py-4 border-t flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-4"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <p className="text-xs sm:text-sm hidden sm:block" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Explore todas as funcionalidades e automatize seu processo de vendas.
          </p>
          <div className="flex items-center gap-2 sm:flex-shrink-0">
            <button
              onClick={() => { onClose(); onOpenFeedback(); }}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-muted/50"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
            >
              <Star className="w-4 h-4" />
              Avaliar
            </button>
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            >
              <Play className="w-4 h-4" />
              Começar agora
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
