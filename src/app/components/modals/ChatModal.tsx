import { useState, useEffect, useRef } from 'react';
import { X, Send } from 'lucide-react';
import { Button } from '../ui/button';
import type { Lead } from '../../types';

interface ChatModalProps {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  webhookUrl: string;
}

interface Mensagem {
  texto: string;
  tipo: 'sent' | 'received';
  hora: string;
}

export default function ChatModal({ isOpen, lead, onClose, webhookUrl }: ChatModalProps) {
  const [mensagem, setMensagem] = useState('');
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [enviando, setEnviando] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && lead) {
      // Inicializar conversa
      setMensagens([]);
    }
  }, [isOpen, lead]);

  useEffect(() => {
    // Scroll automático para última mensagem
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  if (!isOpen || !lead) return null;

  const handleEnviar = async () => {
    if (!mensagem.trim()) return;

    if (!webhookUrl || webhookUrl.trim() === '') {
      alert('⚠️ Configure o webhook de envio de mensagens nas configurações!');
      return;
    }

    setEnviando(true);

    const novaMensagem: Mensagem = {
      texto: mensagem,
      tipo: 'sent',
      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };

    setMensagens(prev => [...prev, novaMensagem]);
    setMensagem('');

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          telefone: lead.telefone,
          nome: lead.nome,
          mensagem: mensagem,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Se o webhook retornar uma resposta, adicionar ao chat
        if (data.resposta) {
          setTimeout(() => {
            const respostaMensagem: Mensagem = {
              texto: data.resposta,
              tipo: 'received',
              hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            };
            setMensagens(prev => [...prev, respostaMensagem]);
          }, 1000);
        }
      } else {
        throw new Error('Erro ao enviar mensagem');
      }
    } catch (error) {
      console.error('Erro ao enviar:', error);
      alert('Erro ao enviar mensagem. Verifique se o webhook está configurado corretamente.');
    } finally {
      setEnviando(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  };

  const inicial = (lead.nome || '?').charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card text-foreground rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-xl border border-border">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex justify-between items-center">
          <div>
            <h2 className="text-xl text-foreground font-semibold">
              💬 Chat com {lead?.nome || 'Lead'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {lead?.telefone || 'Sem telefone'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Chat Container */}
        <div className="flex-1 flex flex-col min-h-0">
          
          {/* Chat Header com info do lead */}
          <div className="bg-green-600 text-white px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-sm">{inicial}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{lead.nome || 'Lead'}</div>
              <div className="text-xs opacity-90">+{lead.telefone}</div>
            </div>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto bg-[#e5ddd5] p-4 space-y-3">
            {mensagens.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <p className="text-sm">Conversa iniciada</p>
              </div>
            ) : (
              mensagens.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.tipo === 'sent' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-2 ${
                      msg.tipo === 'sent'
                        ? 'bg-[#dcf8c6] dark:bg-[#1a4731] text-gray-900 dark:text-gray-100'
                        : 'bg-card text-foreground border border-border'
                    }`}
                  >
                    <div className="text-sm whitespace-pre-wrap break-words">{msg.texto}</div>
                    <div className="text-[11px] text-muted-foreground mt-1 text-right">
                      {msg.hora}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input de Mensagem */}
          <div className="bg-card border-t border-border p-3 flex gap-2">
            <input
              type="text"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Digite uma mensagem..."
              disabled={enviando}
              className="flex-1 px-4 py-2 border border-border rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm bg-background text-foreground placeholder:text-muted-foreground"
            />
            <button
              onClick={handleEnviar}
              disabled={enviando || !mensagem.trim()}
              className="w-10 h-10 bg-green-600 hover:bg-green-700 text-white rounded-full flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {enviando ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}



