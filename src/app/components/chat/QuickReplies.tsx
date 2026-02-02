import type { QuickReply } from './ChatWidget';

interface QuickRepliesProps {
  replies: QuickReply[];
  onSelect: (reply: QuickReply) => void;
}

export function QuickReplies({ replies, onSelect }: QuickRepliesProps) {
  if (!replies || replies.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mt-2">
      <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
        Escolha uma opção:
      </p>
      
      {replies.map((reply, index) => (
        <button
          key={index}
          onClick={() => onSelect(reply)}
          className="px-4 py-2.5 text-sm border border-border rounded-lg bg-card hover:bg-muted hover:border-purple-500 dark:hover:border-purple-400 transition-all text-left flex items-center gap-2 group"
        >
          {reply.icon && <span>{reply.icon}</span>}
          <span className="flex-1">{reply.text}</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-purple-600 dark:text-purple-400">
            →
          </span>
        </button>
      ))}
    </div>
  );
}

