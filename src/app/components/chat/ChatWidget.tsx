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
  ExternalLink
} from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { QuickReplies } from './QuickReplies';
import { TypingIndicator } from './TypingIndicator';
import { SatisfactionRating } from './SatisfactionRating';

export interface Message {
  id: string;
  type: 'user' | 'bot';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
  quickReplies?: QuickReply[];
}

export interface QuickReply {
  text: string;
  action: string;
  icon?: string;
}

interface ChatWidgetProps {
  onNavigate?: (url: string) => void;
  userId?: string;
  userName?: string;
  userPlan?: string;
  currentPage?: string;
}

export function ChatWidget({ 
  onNavigate, 
  userId, 
  userName, 
  userPlan,
  currentPage 
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showSatisfaction, setShowSatisfaction] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

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
    } else {
      // Welcome message
      const welcomeMessage: Message = {
        id: 'welcome',
        type: 'bot',
        content: 'Olá! Como posso ajudar você hoje?\n\nPosso auxiliar com:\n• Gerenciamento de leads\n• Configurações da conta\n• Dúvidas sobre funcionalidades\n• Problemas técnicos',
        timestamp: new Date(),
        quickReplies: [
          { text: '📊 Ver Dashboard', action: 'navigate:/dashboard' },
          { text: '➕ Adicionar Lead', action: 'navigate:/leads' },
          { text: '💬 Falar com Suporte', action: 'contact_support' },
          { text: '📚 Central de Ajuda', action: 'navigate:/help' }
        ]
      };
      setMessages([welcomeMessage]);
    }
  }, []);

  // Save messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      // Keep only last 50 messages
      const toSave = messages.slice(-50);
      localStorage.setItem('leadflow_chat_history', JSON.stringify(toSave));
    }
  }, [messages]);

  // Send message to N8N webhook
  const sendToN8N = async (userMessage: string): Promise<any> => {
    const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL;

    if (!webhookUrl) {
      console.warn('[ChatWidget] N8N webhook URL not configured');
      return null;
    }

    try {
      const response = await fetch(`${webhookUrl}/webhook/chat-message`, {
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

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      type: 'user',
      content: content.trim(),
      timestamp: new Date(),
      status: 'sending'
    };

    setMessages(prev => [...prev, userMessage]);

    // Show typing indicator
    setIsTyping(true);

    try {
      // Send to N8N (or mock response for now)
      // const response = await sendToN8N(content);
      
      // Mock response for demo (remove when integrating with N8N)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const botResponse = getMockResponse(content);

      // Update user message status
      setMessages(prev => prev.map(m => 
        m.id === userMessage.id ? { ...m, status: 'sent' } : m
      ));

      // Add bot response
      const botMessage: Message = {
        id: `msg_${Date.now()}`,
        type: 'bot',
        content: botResponse.response,
        timestamp: new Date(),
        quickReplies: botResponse.quickReplies
      };

      setMessages(prev => [...prev, botMessage]);

      // Check if should show satisfaction
      if (botResponse.showSatisfaction) {
        setShowSatisfaction(true);
      }
    } catch (error) {
      // Update message status to error
      setMessages(prev => prev.map(m => 
        m.id === userMessage.id ? { ...m, status: 'error' } : m
      ));
    } finally {
      setIsTyping(false);
    }
  };

  const handleQuickReply = (reply: QuickReply) => {
    if (reply.action.startsWith('navigate:')) {
      const url = reply.action.replace('navigate:', '');
      onNavigate?.(url);
      setIsOpen(false);
    } else if (reply.action === 'contact_support') {
      handleSendMessage('Preciso falar com o suporte humano');
    } else {
      handleSendMessage(reply.text);
    }
  };

  const handleRetry = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message && message.type === 'user') {
      // Remove failed message
      setMessages(prev => prev.filter(m => m.id !== messageId));
      // Resend
      handleSendMessage(message.content);
    }
  };

  const handleClearChat = () => {
    if (confirm('Tem certeza que deseja limpar o histórico de conversas?')) {
      setMessages([]);
      localStorage.removeItem('leadflow_chat_history');
      setShowSatisfaction(false);
      
      // Add welcome message again
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
    
    // Add thank you message
    const thankYouMessage: Message = {
      id: `msg_${Date.now()}`,
      type: 'bot',
      content: 'Obrigado pelo feedback! 🙏',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, thankYouMessage]);
  };

  // Mobile fullscreen mode
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-full shadow-lg transition-all hover:scale-110"
        aria-label="Abrir chat"
      >
        <MessageCircle className="h-6 w-6" />
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
          1
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
      <ChatInput onSend={handleSendMessage} disabled={isTyping} />
    </div>
  );
}

// Mock response generator (replace with N8N integration)
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
      response: 'Vou transferir você para nossa equipe de suporte. Um atendente humano responderá em breve.\n\nEnquanto isso, você pode:\n• Enviar email: suporte@leadsflow.com\n• WhatsApp: +55 11 98765-4321',
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

