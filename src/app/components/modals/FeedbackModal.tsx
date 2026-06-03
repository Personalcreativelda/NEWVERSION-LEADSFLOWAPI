import { useState } from 'react';
import { X, Star, AlertTriangle, MessageSquare, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.leadsflowapi.com';

type FeedbackType = 'rating' | 'problem';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [type, setType] = useState<FeedbackType>('rating');
  const [stars, setStars] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setType('rating');
    setStars(0);
    setHoveredStar(0);
    setMessage('');
    setDone(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (type === 'rating' && stars === 0) {
      toast.error('Selecione uma avaliação de 1 a 5 estrelas');
      return;
    }
    if (type === 'problem' && !message.trim()) {
      toast.error('Descreva o problema encontrado');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('leadflow_access_token');
      const res = await fetch(`${API_URL}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ type, stars: type === 'rating' ? stars : null, message }),
      });
      if (!res.ok) throw new Error('Erro ao enviar feedback');
      setDone(true);
    } catch {
      toast.error('Não foi possível enviar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const starLabels = ['', 'Muito ruim', 'Ruim', 'Regular', 'Bom', 'Excelente'];

  return (
    <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div
        className="relative w-full max-w-md rounded-2xl border shadow-2xl"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
            {type === 'rating' ? '⭐ Avaliar plataforma' : '🐛 Relatar problema'}
          </h2>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
          </button>
        </div>

        {done ? (
          <div className="px-5 py-10 flex flex-col items-center gap-3 text-center">
            <CheckCircle className="w-12 h-12 text-green-500" />
            <p className="text-base font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              Obrigado pelo seu feedback!
            </p>
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Sua opinião nos ajuda a melhorar cada vez mais.
            </p>
            <button
              onClick={handleClose}
              className="mt-2 px-5 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            >
              Fechar
            </button>
          </div>
        ) : (
          <div className="px-5 py-5 space-y-4">
            {/* Type switcher */}
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'hsl(var(--border))' }}>
              <button
                onClick={() => setType('rating')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${
                  type === 'rating' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'
                }`}
                style={type !== 'rating' ? { color: 'hsl(var(--muted-foreground))' } : {}}
              >
                <MessageSquare className="w-4 h-4" />
                Avaliação
              </button>
              <button
                onClick={() => setType('problem')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${
                  type === 'problem' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'
                }`}
                style={type !== 'problem' ? { color: 'hsl(var(--muted-foreground))' } : {}}
              >
                <AlertTriangle className="w-4 h-4" />
                Problema
              </button>
            </div>

            {type === 'rating' && (
              <div className="space-y-3">
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Como você avalia nossa plataforma?
                </p>
                {/* Stars */}
                <div className="flex items-center justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setStars(n)}
                      onMouseEnter={() => setHoveredStar(n)}
                      onMouseLeave={() => setHoveredStar(0)}
                      className="transition-transform hover:scale-110 active:scale-95"
                    >
                      <Star
                        className="w-9 h-9 transition-colors"
                        fill={(hoveredStar || stars) >= n ? '#FBBF24' : 'none'}
                        stroke={(hoveredStar || stars) >= n ? '#FBBF24' : 'hsl(var(--border))'}
                        strokeWidth={1.5}
                      />
                    </button>
                  ))}
                </div>
                {(hoveredStar || stars) > 0 && (
                  <p className="text-center text-sm font-medium text-yellow-500">
                    {starLabels[hoveredStar || stars]}
                  </p>
                )}
              </div>
            )}

            {/* Message */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {type === 'rating' ? 'Comentário (opcional)' : 'Descreva o problema *'}
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={
                  type === 'rating'
                    ? 'O que achou da plataforma? Sugestões...'
                    : 'Descreva o que aconteceu, em qual tela e como reproduzir...'
                }
                rows={4}
                className="w-full px-3 py-2.5 rounded-lg border text-sm resize-none"
                style={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                }}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? 'Enviando...' : 'Enviar feedback'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
