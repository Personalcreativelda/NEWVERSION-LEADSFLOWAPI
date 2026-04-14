import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { AlertTriangle, Info, Trash2, Send, X } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────
type ConfirmVariant = 'default' | 'danger' | 'warning' | 'info';

interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  /** Extra detail shown in a small box (e.g. recipient count) */
  detail?: string;
}

interface ConfirmContextType {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

// ─── Provider ──────────────────────────────────────────────────────────────
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [options, setOptions] = useState<ConfirmOptions>({});
  const resolveRef = useRef<(value: boolean) => void>(() => {});

  const confirm = useCallback((msg: string, opts?: ConfirmOptions): Promise<boolean> => {
    setMessage(msg);
    setOptions(opts || {});
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = () => {
    setOpen(false);
    resolveRef.current(true);
  };

  const handleCancel = () => {
    setOpen(false);
    resolveRef.current(false);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {open && (
        <ConfirmModal
          message={message}
          options={options}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────
export function useConfirm(): ConfirmContextType['confirm'] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx.confirm;
}

// ─── Modal UI ──────────────────────────────────────────────────────────────
const variantConfig = {
  default: {
    icon: Info,
    iconClass: 'text-blue-500',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    confirmClass: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  danger: {
    icon: Trash2,
    iconClass: 'text-red-500',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-yellow-500',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    confirmClass: 'bg-yellow-500 hover:bg-yellow-600 text-white',
  },
  info: {
    icon: Send,
    iconClass: 'text-green-500',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    confirmClass: 'bg-green-600 hover:bg-green-700 text-white',
  },
};

interface ConfirmModalProps {
  message: string;
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ message, options, onConfirm, onCancel }: ConfirmModalProps) {
  const variant = options.variant || 'default';
  const { icon: Icon, iconClass, iconBg, confirmClass } = variantConfig[variant];

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      {/* Card */}
      <div
        className="relative w-full max-w-sm rounded-2xl shadow-2xl border border-border bg-card text-card-foreground animate-in zoom-in-95 fade-in duration-150"
        role="alertdialog"
        aria-modal="true"
      >
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-full ${iconBg} flex items-center justify-center mb-4`}>
            <Icon className={`w-6 h-6 ${iconClass}`} />
          </div>

          {/* Title */}
          <h3 className="text-base font-semibold text-foreground mb-1">
            {options.title || 'Confirmar ação'}
          </h3>

          {/* Message */}
          <p className="text-sm text-muted-foreground mb-1 leading-relaxed">
            {message}
          </p>

          {/* Extra detail */}
          {options.detail && (
            <p className="text-sm font-medium text-foreground mt-2 mb-1">
              {options.detail}
            </p>
          )}

          {/* Description */}
          {options.description && (
            <p className="text-xs text-muted-foreground mt-2 border-t border-border pt-2">
              {options.description}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-6 pb-6">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-medium border border-border bg-transparent text-foreground hover:bg-muted transition-colors"
          >
            {options.cancelLabel || 'Cancelar'}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${confirmClass}`}
          >
            {options.confirmLabel || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
