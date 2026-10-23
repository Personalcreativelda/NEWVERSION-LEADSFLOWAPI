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

/**
 * Nome e foto de quem escreveu no Messenger (PSID). Tenta, por ordem:
 *  1) perfil com first_name/last_name (pedir "name" junto faz o pedido inteiro falhar em algumas contas)
 *  2) perfil com name
 *  3) a conversa da página (participants), que funciona quando o perfil está restrito
 */
export async function fetchMessengerProfile(
  psid: string,
  pageToken: string,
  pageId?: string | null,
): Promise<{ name?: string; picture?: string; error?: string }> {
  const get = async (url: string): Promise<any> => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      return await res.json();
    } catch {
      return null;
    }
  };
  const token = encodeURIComponent(pageToken);
  const id = encodeURIComponent(psid);

  const a = await get(`${FB_GRAPH}/${id}?fields=first_name,last_name,profile_pic&access_token=${token}`);
  const picture: string | undefined = a?.profile_pic || undefined;
  if (a && !a.error && (a.first_name || a.last_name)) {
    return { name: [a.first_name, a.last_name].filter(Boolean).join(' '), picture };
  }

  const b = await get(`${FB_GRAPH}/${id}?fields=name,profile_pic&access_token=${token}`);
  if (b && !b.error && b.name) return { name: b.name, picture: b.profile_pic || picture };

  const c = await get(`${FB_GRAPH}/${encodeURIComponent(pageId || 'me')}/conversations?platform=messenger&user_id=${id}&fields=participants&access_token=${token}`);
  const participant = c?.data?.[0]?.participants?.data?.find((p: any) => String(p.id) === String(psid));
  if (participant?.name) return { name: participant.name, picture };

  return { picture, error: a?.error?.message || b?.error?.message || c?.error?.message || 'sem resposta' };
}
