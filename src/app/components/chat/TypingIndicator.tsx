import { MessageCircle } from 'lucide-react';

export function TypingIndicator() {
  return (
    <div className="flex justify-start animate-fadeIn">
      <div className="flex gap-2 max-w-[85%]">
        {/* Avatar */}
        <div className="flex-shrink-0 mt-1">
          <div className="bg-purple-600 p-1.5 rounded-full">
            <MessageCircle className="h-4 w-4 text-white" />
          </div>
        </div>

        {/* Typing Bubble */}
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

