import { MessageCircle, User, AlertCircle, RotateCcw } from 'lucide-react';
import type { Message, QuickReply } from './ChatWidget';

interface ChatMessageProps {
  message: Message;
  onRetry: (messageId: string) => void;
  onQuickReply: (reply: QuickReply) => void;
}

export function ChatMessage({ message, onRetry, onQuickReply }: ChatMessageProps) {
  const isBot = message.type === 'bot';
  const hasError = message.status === 'error';

  return (
    <div className={`flex ${isBot ? 'justify-start' : 'justify-end'} animate-fadeIn`}>
      <div className={`flex gap-2 max-w-[85%] ${isBot ? 'flex-row' : 'flex-row-reverse'}`}>
        {/* Avatar */}
        {isBot && (
          <div className="flex-shrink-0 mt-1">
            <div className="bg-purple-600 p-1.5 rounded-full">
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
          </div>
        )}

        {/* Message Bubble */}
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
            {/* Message Content */}
            <div className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </div>

            {/* Timestamp */}
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

              {/* Status Icons */}
              {!isBot && (
                <>
                  {message.status === 'sending' && (
                    <span className="text-xs">⋯</span>
                  )}
                  {message.status === 'sent' && (
                    <span className="text-xs">✓✓</span>
                  )}
                  {message.status === 'error' && (
                    <AlertCircle className="h-3 w-3" />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Error Retry Button */}
          {hasError && (
            <button
              onClick={() => onRetry(message.id)}
              className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors self-end"
            >
              <RotateCcw className="h-3 w-3" />
              Reenviar
            </button>
          )}

          {/* Quick Replies */}
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

