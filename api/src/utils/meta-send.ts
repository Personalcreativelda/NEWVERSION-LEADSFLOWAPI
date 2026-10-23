// Endereço para enviar mensagens no Messenger/Instagram conforme o tipo de token:
// - token do login do Instagram (IGAA…): graph.instagram.com, em nome da própria conta (/me)
// - token de página (EAA…): graph.facebook.com, pela página (page_id) ou /me
const FB_GRAPH = 'https://graph.facebook.com/v21.0';
const IG_GRAPH = 'https://graph.instagram.com/v21.0';

export const isInstagramLoginToken = (token?: string | null) => /^IG/.test(String(token || ''));

export function metaMessagesUrl(token: string, pageId?: string | null): string {
  if (isInstagramLoginToken(token)) return `${IG_GRAPH}/me/messages`;
  return pageId ? `${FB_GRAPH}/${encodeURIComponent(pageId)}/messages` : `${FB_GRAPH}/me/messages`;
}
