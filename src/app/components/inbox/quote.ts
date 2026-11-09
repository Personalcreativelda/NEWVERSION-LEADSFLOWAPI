// Respostas a mensagens (como no WhatsApp): o resumo da mensagem citada
import type { MessageWithSender } from '../../types/inbox';

export interface QuotedMessage {
    id?: string;
    content: string;
    direction: 'in' | 'out';
    media_type?: string | null;
}

const MEDIA_LABEL: Record<string, string> = {
    image: '📷 Foto', video: '🎥 Vídeo', audio: '🎤 Áudio', document: '📄 Documento', sticker: 'Sticker',
};
const PLACEHOLDERS = new Set(['[Mídia]', '[Imagem]', '[Vídeo]', '[Áudio]', '[Documento]', '[Sticker]', '[image]', '[video]', '[audio]', '[document]', '[sticker]', '📎 Mídia']);

export function quoteOf(message: MessageWithSender): QuotedMessage {
    const raw = String(message.content ?? '').trim();
    const media = message.media_type || null;
    const text = !raw || PLACEHOLDERS.has(raw) ? (MEDIA_LABEL[media || ''] || 'Mensagem') : raw;
    return {
        id: message.id,
        content: text.length > 220 ? text.slice(0, 217) + '…' : text,
        direction: message.direction === 'out' ? 'out' : 'in',
        media_type: media,
    };
}

/** Citação guardada na mensagem (metadata.quoted) */
export function quotedIn(message: MessageWithSender): QuotedMessage | null {
    const q = (message.metadata as any)?.quoted;
    return q && typeof q === 'object' && typeof q.content === 'string' ? q : null;
}

/** Reações rápidas do menu da mensagem */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
