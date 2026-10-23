// INBOX: Lista de conversas - ManyChat-style
import { useRef } from 'react';
import { haptic } from '../../../native';
import { ConversationItem } from './ConversationItem';
import type { ConversationWithDetails } from '../../types/inbox';
import { Inbox, CheckSquare, Square, Loader2 } from 'lucide-react';
import { SkeletonConversationList } from '../ui/skeletons';

interface ConversationListProps {
    conversations: ConversationWithDetails[];
    selectedId: string | null;
    onSelect: (conversation: ConversationWithDetails) => void;
    loading: boolean;
    isSelectMode?: boolean;
    selectedIds?: Set<string>;
    onToggleSelect?: (id: string) => void;
    /** Toque longo numa conversa (entra em seleção múltipla) */
    onLongPress?: (id: string) => void;
}

export function ConversationList({
    conversations,
    selectedId,
    onSelect,
    loading,
    isSelectMode = false,
    selectedIds = new Set(),
    onLongPress,
    onToggleSelect,
}: ConversationListProps) {
    // Toque longo (500 ms) → seleção; o "click" que vem a seguir é ignorado
    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suppressClick = useRef(false);
    const pressStart = useRef<{ x: number; y: number } | null>(null);
    const cancelPress = () => {
        if (pressTimer.current) clearTimeout(pressTimer.current);
        pressTimer.current = null;
    };
    const longPressHandlers = (id: string) => onLongPress ? {
        onTouchStart: (e: React.TouchEvent) => {
            pressStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            suppressClick.current = false;
            cancelPress();
            pressTimer.current = setTimeout(() => {
                suppressClick.current = true;
                haptic('medium');
                onLongPress(id);
            }, 500);
        },
        onTouchMove: (e: React.TouchEvent) => {
            const s0 = pressStart.current;
            if (s0 && (Math.abs(e.touches[0].clientX - s0.x) > 10 || Math.abs(e.touches[0].clientY - s0.y) > 10)) cancelPress();
        },
        onTouchEnd: cancelPress,
        onTouchCancel: cancelPress,
        onContextMenu: (e: React.MouseEvent) => {
            e.preventDefault();
            onLongPress(id);
        },
    } : {};


    if (loading && conversations.length === 0) {
        return <SkeletonConversationList count={9} />;
    }

    if (!loading && conversations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-10 text-center">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 bg-muted">
                    <Inbox className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                    Nenhuma conversa
                </p>
                <p className="text-xs mt-1 text-muted-foreground/70">
                    Seu histórico aparecerá aqui.
                </p>
            </div>
        );
    }

    return (
        <div className="overflow-x-hidden">
            {conversations.map((conversation) => (
                <div key={conversation.id} className="relative flex items-center">
                    {isSelectMode && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleSelect?.(conversation.id); }}
                            className="absolute left-2 z-10 p-1 rounded transition-colors text-muted-foreground hover:text-primary"
                        >
                            {selectedIds.has(conversation.id)
                                ? <CheckSquare size={16} className="text-primary" />
                                : <Square size={16} />
                            }
                        </button>
                    )}
                    <div
                        {...longPressHandlers(conversation.id)}
                        className={`flex-1 min-w-0 select-none transition-all duration-150 ${isSelectMode ? 'pl-8' : ''} ${isSelectMode && selectedIds.has(conversation.id) ? 'bg-primary/5' : ''}`}
                    >
                        <ConversationItem
                            conversation={conversation}
                            isSelected={!isSelectMode && selectedId === conversation.id}
                            onClick={() => {
                                if (suppressClick.current) {
                                    suppressClick.current = false;
                                    return;
                                }
                                if (isSelectMode) {
                                    onToggleSelect?.(conversation.id);
                                } else {
                                    onSelect(conversation);
                                }
                            }}
                        />
                    </div>
                </div>
            ))}

            {loading && conversations.length > 0 && (
                <div className="p-3 flex justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
            )}
        </div>
    );
}
