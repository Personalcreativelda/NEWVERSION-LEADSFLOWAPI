import { useState, useRef, KeyboardEvent } from 'react';
import { Send, Paperclip, Mic } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message);
      setMessage('');
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  };

  const handleAttachment = () => {
    // TODO: Implement file attachment
    alert('Funcionalidade de anexo em desenvolvimento');
  };

  const handleVoice = () => {
    // TODO: Implement voice recording
    setIsRecording(!isRecording);
    if (!isRecording) {
      alert('Funcionalidade de áudio em desenvolvimento');
    }
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 rounded-b-2xl">
      <div className="flex items-end gap-2">
        {/* Attachment Button */}
        <button
          onClick={handleAttachment}
          className="p-2 text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors flex-shrink-0"
          aria-label="Anexar arquivo"
          title="Anexar arquivo"
          disabled={disabled}
        >
          <Paperclip className="h-5 w-5" />
        </button>

        {/* Message Input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Digite sua mensagem..."
            disabled={disabled}
            rows={1}
            className="w-full px-4 py-2.5 pr-12 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            style={{ maxHeight: '120px' }}
          />
          
          {/* Character count (optional) */}
          {message.length > 0 && (
            <span className="absolute bottom-2 right-2 text-xs text-gray-500 dark:text-gray-400">
              {message.length}
            </span>
          )}
        </div>

        {/* Voice Button */}
        <button
          onClick={handleVoice}
          className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
            isRecording
              ? 'text-red-600 bg-red-50 dark:bg-red-900/20'
              : 'text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20'
          }`}
          aria-label={isRecording ? 'Parar gravação' : 'Gravar áudio'}
          title={isRecording ? 'Parar gravação' : 'Gravar áudio'}
          disabled={disabled}
        >
          <Mic className={`h-5 w-5 ${isRecording ? 'animate-pulse' : ''}`} />
        </button>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={!message.trim() || disabled}
          className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          aria-label="Enviar mensagem"
          title="Enviar (Enter)"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>

      {/* Hint Text */}
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
        <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Enter</kbd> para enviar, 
        <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs ml-1">Shift+Enter</kbd> para quebra de linha
      </p>
    </div>
  );
}

