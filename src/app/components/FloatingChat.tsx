import { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, 
  X, 
  Maximize2, 
  Minimize2, 
  Send, 
  Paperclip, 
  Mic, 
  RotateCcw,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface FloatingChatProps {
  chatWebhookUrl?: string;
  chatType?: 'n8n' | 'typebot' | 'openai';
  onNavigate?: (url: string) => void;
  userId?: string;
  userName?: string;
  userPlan?: string;
  currentPage?: string;
}

interface Message {
  id: string;
  type: 'user' | 'bot';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
  quickReplies?: QuickReply[];
}

interface QuickReply {
  text: string;
  action: string;
  icon?: string;
}

export function FloatingChat({ 
  chatWebhookUrl = '',
  chatType = 'openai', // Default to OpenAI
  onNavigate,
  userId,
  userName,
  userPlan,
  currentPage
}: FloatingChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSatisfaction, setShowSatisfaction] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Debug: Log configuration on mount
  useEffect(() => {
    console.log('[Chat] 🔧 Configuration:', {
      chatType,
      hasProjectId: !!projectId,
      hasPublicAnonKey: !!publicAnonKey,
      projectId: projectId?.substring(0, 10) + '...',
    });
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load messages from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('leadflow_chat_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setMessages(parsed.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        })));
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    } else if (isOpen && messages.length === 0) {
      // Welcome message - Educational approach
      const welcomeMessage: Message = {
        id: 'welcome',
        type: 'bot',
        content: `Olá${userName ? ', ' + userName : ''}! 👋 Sou o assistente inteligente do LeadsFlow.\n\nEstou aqui para te ajudar a:\n\n✅ Adicionar e gerenciar leads\n✅ Configurar automações de WhatsApp\n✅ Entender o funil de vendas\n✅ Resolver problemas técnicos\n✅ Tirar dúvidas sobre funcionalidades\n\nQual dessas áreas você precisa de ajuda agora?`,
        timestamp: new Date(),
        quickReplies: [
          { text: '➕ Como adicionar leads?', action: 'help_add_leads' },
          { text: '📊 Como funciona o funil?', action: 'help_funnel' },
          { text: '💬 Configurar WhatsApp', action: 'help_whatsapp' },
          { text: '🆘 Outro assunto', action: 'help_other' }
        ]
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen]);

  // Save messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      const toSave = messages.slice(-50);
      localStorage.setItem('leadflow_chat_history', JSON.stringify(toSave));
    }
  }, [messages]);

  // Send message to N8N webhook
  const sendToN8N = async (userMessage: string): Promise<any> => {
    if (!chatWebhookUrl) {
      throw new Error('Webhook URL not configured');
    }

    try {
      const response = await fetch(chatWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          userName,
          message: userMessage,
          timestamp: new Date().toISOString(),
          sessionId,
          context: {
            currentPage,
            userPlan
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      return await response.json();
    } catch (error) {
      console.error('Error sending to N8N:', error);
      throw error;
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isTyping) return;

    const content = inputMessage.trim();
    setInputMessage('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Add user message
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      type: 'user',
      content,
      timestamp: new Date(),
      status: 'sending'
    };

    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    try {
      let botResponse: any;

      // Determine which service to use
      if (chatType === 'openai' && projectId && publicAnonKey) {
        // Use OpenAI via backend
        try {
          console.log('[Chat] 🤖 Calling OpenAI backend endpoint...');
          const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-4be966ab/chat/message`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${publicAnonKey}`
            },
            body: JSON.stringify({
              userId,
              userName,
              message: content,
              sessionId,
              context: {
                currentPage,
                userPlan
              }
            })
          });

          if (response.ok) {
            botResponse = await response.json();
            console.log('[Chat] ✅ OpenAI response received:', botResponse.response?.substring(0, 100));
          } else {
            const errorText = await response.text();
            console.error('[Chat] ❌ OpenAI endpoint error:', response.status, errorText);
            throw new Error('OpenAI endpoint failed');
          }
        } catch (error) {
          console.warn('[Chat] ⚠️ OpenAI failed, using mock response. Error:', error);
          await new Promise(resolve => setTimeout(resolve, 1000));
          botResponse = getMockResponse(content);
        }
      } else if (chatWebhookUrl) {
        // Use N8N webhook if configured
        try {
          botResponse = await sendToN8N(content);
        } catch (error) {
          console.warn('[Chat] ⚠️ N8N webhook failed, using mock response');
          await new Promise(resolve => setTimeout(resolve, 1000));
          botResponse = getMockResponse(content);
        }
      } else {
        // Fallback to mock
        await new Promise(resolve => setTimeout(resolve, 1000));
        botResponse = getMockResponse(content);
      }

      // Update user message status
      setMessages(prev => prev.map(m => 
        m.id === userMessage.id ? { ...m, status: 'sent' } : m
      ));

      // Add bot response
      const botMessage: Message = {
        id: `msg_${Date.now()}`,
        type: 'bot',
        content: botResponse.response || botResponse.message || botResponse.text || 'Mensagem recebida!',
        timestamp: new Date(),
        quickReplies: botResponse.quickReplies
      };

      setMessages(prev => [...prev, botMessage]);

      // Check if should show satisfaction
      if (botResponse.showSatisfaction) {
        setShowSatisfaction(true);
      }
    } catch (error) {
      console.error('[Chat] ❌ Error handling message:', error);
      
      // Update message status to error
      setMessages(prev => prev.map(m => 
        m.id === userMessage.id ? { ...m, status: 'error' } : m
      ));
    } finally {
      setIsTyping(false);
    }
  };

  const handleQuickReply = async (reply: QuickReply) => {
    // Adiciona a mensagem do usuário primeiro
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      type: 'user',
      content: reply.text,
      timestamp: new Date(),
      status: 'sent'
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    // Aguarda um pouco para parecer mais natural
    await new Promise(resolve => setTimeout(resolve, 500));

    // Processa a ação
    if (reply.action.startsWith('navigate:')) {
      const url = reply.action.replace('navigate:', '');
      
      // Adiciona mensagem de confirmação antes de navegar
      const botMessage: Message = {
        id: `msg_${Date.now()}`,
        type: 'bot',
        content: `Perfeito! Vou te direcionar para ${url === '/dashboard' ? 'o Dashboard' : url === '/leads' ? 'a página de Leads' : url === '/settings' ? 'as Configurações' : 'essa página'}. ✨`,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, botMessage]);
      setIsTyping(false);
      
      // Aguarda 800ms e navega
      setTimeout(() => {
        onNavigate?.(url);
        setIsOpen(false);
      }, 800);
      
    } else if (reply.action === 'contact_support' || reply.action === 'human_support') {
      // Dispara webhook N8N para atendente humano
      try {
        const n8nWebhookUrl = import.meta.env.VITE_N8N_SUPPORT_WEBHOOK_URL;

        const botMessage: Message = {
          id: `msg_${Date.now()}`,
          type: 'bot',
          content: '🙋‍♂️ Entendi! Estou conectando você com nossa equipe de suporte humano...\n\nUm atendente especializado já foi notificado e responderá em breve. Enquanto isso, pode me contar mais sobre sua dúvida?',
          timestamp: new Date()
        };

        setMessages(prev => [...prev, botMessage]);
        setIsTyping(false);

        // Envia notificação para N8N (se configurado)
        if (n8nWebhookUrl) {
          await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              event: 'human_support_requested',
            userId: userId || 'anonymous',
            userName: userName || 'Usuário',
            userPlan: currentPage,
              sessionId,
              message: reply.text,
              timestamp: new Date().toISOString(),
              conversationHistory: messages.slice(-10).map(m => ({
                type: m.type,
                content: m.content,
                timestamp: m.timestamp
              }))
            })
          }).catch(err => console.warn('[Chat] ⚠️ Failed to notify N8N:', err));
        }

      } catch (error) {
        console.error('[Chat] ❌ Error contacting support:', error);
        setIsTyping(false);
      }
      
    } else {
      // Para outras ações, envia como mensagem normal para OpenAI
      setInputMessage('');
      
      try {
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-4be966ab/chat/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({
            userId,
            userName,
            message: reply.text,
            sessionId,
            context: {
              currentPage,
              userPlan,
              action: reply.action
            }
          })
        });

        if (response.ok) {
          const botResponse = await response.json();
          
          const botMessage: Message = {
            id: `msg_${Date.now()}`,
            type: 'bot',
            content: botResponse.response || 'Posso ajudar com mais alguma coisa?',
            timestamp: new Date(),
            quickReplies: botResponse.quickReplies
          };
          
          setMessages(prev => [...prev, botMessage]);
          
          if (botResponse.showSatisfaction) {
            setShowSatisfaction(true);
          }
        }
      } catch (error) {
        console.error('[Chat] ❌ Error processing quick reply:', error);
      } finally {
        setIsTyping(false);
      }
    }
  };

  const handleRetry = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message && message.type === 'user') {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      setInputMessage(message.content);
    }
  };

  const handleClearChat = () => {
    if (confirm('Tem certeza que deseja limpar o histórico de conversas?')) {
      setMessages([]);
      localStorage.removeItem('leadflow_chat_history');
      setShowSatisfaction(false);
      
      const welcomeMessage: Message = {
        id: 'welcome',
        type: 'bot',
        content: 'Conversa limpa. Como posso ajudar você?',
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  };

  const handleSatisfactionRating = (rating: number) => {
    console.log('User rated satisfaction:', rating);
    setShowSatisfaction(false);
    
    const thankYouMessage: Message = {
      id: `msg_${Date.now()}`,
      type: 'bot',
      content: 'Obrigado pelo feedback! 🙏',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, thankYouMessage]);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-full shadow-lg transition-all hover:scale-110"
        aria-label="Abrir chat"
      >
        <MessageCircle className="h-6 w-6" />
        <span className="absolute -top-1 -right-1 bg-green-500 border-2 border-white dark:border-gray-900 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
          ●
        </span>
      </button>
    );
  }

  return (
    <div
      className={`fixed z-50 bg-white dark:bg-gray-900 shadow-lg flex flex-col ${
        isMobile
          ? 'inset-0'
          : isExpanded
          ? 'bottom-6 right-6 w-[450px] h-[700px] rounded-2xl'
          : 'bottom-6 right-6 w-[380px] h-[600px] rounded-2xl'
      }`}
    >
      {/* Header */}
      <div className="bg-slate-800 dark:bg-slate-900 text-white px-4 py-3 rounded-t-2xl flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="bg-purple-600 p-2 rounded-full">
              <MessageCircle className="h-5 w-5" />
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-slate-800 rounded-full"></span>
          </div>
          <div>
            <h3 className="font-semibold text-sm">Assistente LeadsFlow</h3>
            <p className="text-xs text-slate-400">● Online • Resposta em ~30s</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isMobile && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 hover:bg-slate-700 rounded transition-colors"
              aria-label={isExpanded ? 'Minimizar' : 'Expandir'}
            >
              {isExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
          )}
          
          <button
            onClick={handleClearChat}
            className="p-1.5 hover:bg-slate-700 rounded transition-colors"
            aria-label="Limpar conversa"
            title="Limpar conversa"
          >
            <Trash2 className="h-4 w-4" />
          </button>

          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-slate-700 rounded transition-colors"
            aria-label="Fechar chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50 dark:bg-gray-800"
      >
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onRetry={handleRetry}
            onQuickReply={handleQuickReply}
          />
        ))}

        {isTyping && <TypingIndicator />}

        {showSatisfaction && (
          <SatisfactionRating onRate={handleSatisfactionRating} />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 rounded-b-2xl">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              onInput={handleInput}
              placeholder="Digite sua mensagem..."
              disabled={isTyping}
              rows={1}
              className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              style={{ maxHeight: '120px' }}
            />
          </div>

          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isTyping}
            className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            aria-label="Enviar mensagem"
            title="Enviar (Enter)"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
          <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Enter</kbd> para enviar, 
          <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs ml-1">Shift+Enter</kbd> para quebra de linha
        </p>
      </div>
    </div>
  );
}

// Chat Message Component
function ChatMessage({ 
  message, 
  onRetry, 
  onQuickReply 
}: { 
  message: Message; 
  onRetry: (id: string) => void;
  onQuickReply: (reply: QuickReply) => void;
}) {
  const isBot = message.type === 'bot';
  const hasError = message.status === 'error';

  return (
    <div className={`flex ${isBot ? 'justify-start' : 'justify-end'} animate-fadeIn`}>
      <div className={`flex gap-2 max-w-[85%] ${isBot ? 'flex-row' : 'flex-row-reverse'}`}>
        {isBot && (
          <div className="flex-shrink-0 mt-1">
            <div className="bg-purple-600 p-1.5 rounded-full">
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div
            className={`rounded-2xl px-4 py-2.5 ${
              isBot
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-tl-none'
                : hasError
                ? 'bg-red-500 text-white rounded-tr-none'
                : 'bg-purple-600 text-white rounded-tr-none'
            }`}
          >
            <div className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </div>

            <div
              className={`text-xs mt-1.5 flex items-center gap-2 ${
                isBot
                  ? 'text-gray-500 dark:text-gray-500 dark:text-gray-400'
                  : 'text-purple-100'
              }`}
            >
              <span>
                {message.timestamp.toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>

              {!isBot && (
                <>
                  {message.status === 'sending' && <span className="text-xs">⋯</span>}
                  {message.status === 'sent' && <span className="text-xs">✓✓</span>}
                  {message.status === 'error' && <AlertCircle className="h-3 w-3" />}
                </>
              )}
            </div>
          </div>

          {hasError && (
            <button
              onClick={() => onRetry(message.id)}
              className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors self-end"
            >
              <RotateCcw className="h-3 w-3" />
              Reenviar
            </button>
          )}

          {isBot && message.quickReplies && message.quickReplies.length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              {message.quickReplies.map((reply, index) => (
                <button
                  key={index}
                  onClick={() => onQuickReply(reply)}
                  className="px-4 py-2.5 text-sm border border-border rounded-lg bg-card hover:bg-muted hover:border-purple-500 dark:hover:border-purple-400 transition-all text-left flex items-center gap-2 group"
                >
                  <span>{reply.text}</span>
                  <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Typing Indicator
function TypingIndicator() {
  return (
    <div className="flex justify-start animate-fadeIn">
      <div className="flex gap-2 max-w-[85%]">
        <div className="flex-shrink-0 mt-1">
          <div className="bg-purple-600 p-1.5 rounded-full">
            <MessageCircle className="h-4 w-4 text-white" />
          </div>
        </div>

        <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-tl-none px-4 py-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Satisfaction Rating
function SatisfactionRating({ onRate }: { onRate: (rating: number) => void }) {
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);

  const emojis = [
    { rating: 5, emoji: '😀', label: 'Excelente' },
    { rating: 4, emoji: '😊', label: 'Bom' },
    { rating: 3, emoji: '😐', label: 'Regular' },
    { rating: 2, emoji: '😕', label: 'Ruim' },
    { rating: 1, emoji: '😞', label: 'Péssimo' }
  ];

  const handleRate = (rating: number) => {
    setSelectedRating(rating);
    setTimeout(() => {
      onRate(rating);
    }, 500);
  };

  if (selectedRating) {
    return (
      <div className="flex justify-center animate-fadeIn">
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl px-6 py-4 text-center">
          <p className="text-sm text-green-800 dark:text-green-200">
            ✓ Obrigado pelo feedback!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center animate-fadeIn">
      <div className="bg-card border border-border rounded-2xl px-6 py-4 max-w-sm">
        <p className="text-sm text-gray-900 dark:text-gray-100 font-medium text-center mb-4">
          Como foi o atendimento?
        </p>
        
        <div className="flex justify-center gap-3">
          {emojis.map(({ rating, emoji, label }) => (
            <button
              key={rating}
              onClick={() => handleRate(rating)}
              onMouseEnter={() => setHoveredRating(rating)}
              onMouseLeave={() => setHoveredRating(null)}
              className="group relative"
              aria-label={label}
              title={label}
            >
              <div
                className={`text-3xl transition-transform ${
                  hoveredRating === rating ? 'scale-125' : 'scale-100'
                }`}
              >
                {emoji}
              </div>
              
              {hoveredRating === rating && (
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded">
                  {label}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Mock response generator
function getMockResponse(userMessage: string): {
  response: string;
  quickReplies?: QuickReply[];
  showSatisfaction?: boolean;
} {
  const message = userMessage.toLowerCase();

  if (message.includes('lead') || message.includes('adicionar')) {
    return {
      response: 'Para adicionar leads, você pode:\n\n1. Importar de CSV/Excel\n2. Adicionar manualmente no dashboard\n3. Conectar via WhatsApp (Evolution API)\n4. Integrar com Facebook/Google Ads\n\nQual método você prefere?',
      quickReplies: [
        { text: '➕ Adicionar manualmente', action: 'navigate:/leads' },
        { text: '📤 Importar CSV', action: 'import_csv' },
        { text: '💬 WhatsApp', action: 'whatsapp_integration' }
      ]
    };
  }

  if (message.includes('plano') || message.includes('upgrade')) {
    return {
      response: 'Nossos planos:\n\n• **Gratuito**: 30 leads/mês\n• **Professional**: 500 leads/mês - R$97\n• **Unlimited**: Leads ilimitados - R$197\n\nTodos os planos incluem 30 dias de acesso.',
      quickReplies: [
        { text: '💳 Ver Planos', action: 'navigate:/plans' },
        { text: '📊 Meu Plano Atual', action: 'current_plan' }
      ]
    };
  }

  if (message.includes('suporte') || message.includes('humano') || message.includes('atendente')) {
    return {
      response: 'Vou transferir você para nossa equipe de suporte.\n\n📧 Email: suporte@leadsflowapi.com\n💬 WhatsApp: +55 11 98765-4321\n\nUm atendente humano responderá em breve!',
      quickReplies: [
        { text: '📧 Enviar Email', action: 'email_support' },
        { text: '💬 WhatsApp', action: 'whatsapp_support' }
      ],
      showSatisfaction: true
    };
  }

  return {
    response: 'Entendi sua dúvida. Posso ajudar com mais detalhes sobre:\n\n• Gerenciamento de leads\n• Automações e integrações\n• Configurações de conta\n• Planos e pagamentos\n\nSobre qual tema você gostaria de saber mais?',
    quickReplies: [
      { text: '📊 Dashboard', action: 'navigate:/dashboard' },
      { text: '⚙️ Configurações', action: 'navigate:/settings' },
      { text: '💬 Falar com humano', action: 'contact_support' }
    ]
  };
}

