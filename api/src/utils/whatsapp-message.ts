// Mensagens do WhatsApp (Evolution/Baileys): tira os envelopes (temporárias, ver uma vez,
// enviadas de outro aparelho…), reconhece reações, edições e mensagens apagadas (que não são
// balões novos) e descreve os tipos sem texto (localização, contacto, sondagem…).

/** Envelopes cujo conteúdo verdadeiro está em .message */
const WRAPPERS = [
  'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension',
  'deviceSentMessage', 'botInvokeMessage', 'futureProofMessage', 'groupMentionedMessage',
  'associatedChildMessage', 'lottieStickerMessage', 'documentWithCaptionMessage',
];

/** Chaves que só trazem dados técnicos (sem conteúdo para mostrar) */
const META_KEYS = new Set(['messageContextInfo', 'senderKeyDistributionMessage']);

/** Tipos que não são mensagens para mostrar */
const IGNORED = new Set([
  'encReactionMessage', 'pollUpdateMessage', 'encCommentMessage', 'keepInChatMessage', 'pinInChatMessage',
  'albumMessage', 'secretEncryptedMessage', 'messageHistoryBundle', 'placeholderMessage', 'peerDataOperationRequestMessage',
  'encEventResponseMessage', 'statusMentionMessage', 'scheduledCallEditMessage', 'callLogMesssage',
]);

export function unwrapWhatsAppMessage(message: any): any {
  let msg = message && typeof message === 'object' ? message : {};
  for (let i = 0; i < 6; i++) {
    const key = WRAPPERS.find((k) => msg?.[k]?.message && typeof msg[k].message === 'object');
    if (!key) break;
    // O conteúdo de dentro substitui o envelope (o contexto técnico de fora mantém-se)
    const { [key]: wrapper, ...rest } = msg;
    msg = { ...rest, ...wrapper.message };
  }
  return msg;
}

/** Tipo principal da mensagem (para diagnóstico e para decidir o que fazer) */
export function whatsAppMessageType(msg: any): string | null {
  if (!msg || typeof msg !== 'object') return null;
  return Object.keys(msg).find((k) => !META_KEYS.has(k) && k !== 'base64') || null;
}

export type WhatsAppEvent =
  | { kind: 'reaction'; targetId: string; emoji: string }
  | { kind: 'revoke'; targetId: string }
  | { kind: 'edit'; targetId: string; text: string }
  | { kind: 'ignore'; type: string };

const textOf = (m: any): string =>
  m?.conversation || m?.extendedTextMessage?.text || m?.imageMessage?.caption || m?.videoMessage?.caption || '';

/** Reação, edição, mensagem apagada ou algo a ignorar: não cria um balão novo */
export function whatsAppEvent(msg: any): WhatsAppEvent | null {
  const type = whatsAppMessageType(msg);
  if (!type) return { kind: 'ignore', type: 'empty' };

  if (msg.reactionMessage?.key?.id) {
    return { kind: 'reaction', targetId: String(msg.reactionMessage.key.id), emoji: String(msg.reactionMessage.text || '') };
  }

  const proto = msg.protocolMessage;
  if (proto) {
    const t = String(proto.type ?? '');
    const targetId = proto.key?.id ? String(proto.key.id) : '';
    if ((t === '0' || t === 'REVOKE') && targetId) return { kind: 'revoke', targetId };
    if ((t === '14' || t === 'MESSAGE_EDIT') && targetId && proto.editedMessage) {
      const text = textOf(unwrapWhatsAppMessage(proto.editedMessage));
      if (text) return { kind: 'edit', targetId, text };
    }
    return { kind: 'ignore', type: `protocolMessage:${t}` };
  }

  // Edição que chega como editedMessage → protocolMessage
  if (msg.editedMessage?.message?.protocolMessage) return whatsAppEvent(msg.editedMessage.message);

  if (IGNORED.has(type)) return { kind: 'ignore', type };
  return null;
}

/** Número de um vCard: o waid (só dígitos, do WhatsApp) ou a linha TEL */
const vcardPhone = (vcard?: string) => {
  const v = String(vcard || '');
  return (v.match(/waid=(\d+)/)?.[1] || v.match(/TEL[^:\n]*:([+\d\s-]+)/)?.[1] || '').trim();
};

/** Texto legível para os tipos sem texto escrito (localização, contacto, sondagem, botões…) */
export function describeWhatsAppMessage(msg: any): string {
  if (!msg || typeof msg !== 'object') return '';
  const loc = msg.locationMessage || msg.liveLocationMessage;
  if (loc && (loc.degreesLatitude != null || loc.name)) {
    const where = [loc.name, loc.address].filter(Boolean).join(' · ');
    const link = loc.degreesLatitude != null ? `https://maps.google.com/?q=${loc.degreesLatitude},${loc.degreesLongitude}` : '';
    return ['📍 ' + (where || 'Localização'), link].filter(Boolean).join('\n');
  }
  if (msg.contactMessage) {
    const phone = vcardPhone(msg.contactMessage.vcard);
    return `👤 ${msg.contactMessage.displayName || 'Contacto'}${phone ? `\n${phone}` : ''}`;
  }
  if (msg.contactsArrayMessage) {
    const list = (msg.contactsArrayMessage.contacts || []).map((c: any) => c.displayName).filter(Boolean);
    return `👤 ${list.length ? list.join(', ') : 'Contactos'}`;
  }
  const poll = msg.pollCreationMessage || msg.pollCreationMessageV2 || msg.pollCreationMessageV3 || msg.pollCreationMessageV4;
  if (poll) {
    const options = (poll.options || []).map((o: any) => `• ${o.optionName}`).join('\n');
    return `📊 ${poll.name || 'Sondagem'}${options ? `\n${options}` : ''}`;
  }
  if (msg.eventMessage) return `📅 ${msg.eventMessage.name || 'Evento'}`;
  if (msg.buttonsResponseMessage) return msg.buttonsResponseMessage.selectedDisplayText || msg.buttonsResponseMessage.selectedButtonId || '';
  if (msg.listResponseMessage) return msg.listResponseMessage.title || msg.listResponseMessage.singleSelectReply?.selectedRowId || '';
  if (msg.templateButtonReplyMessage) return msg.templateButtonReplyMessage.selectedDisplayText || '';
  if (msg.interactiveResponseMessage) {
    const body = msg.interactiveResponseMessage.body?.text;
    if (body) return body;
    try { return JSON.parse(msg.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson || '{}').title || ''; } catch { return ''; }
  }
  if (msg.buttonsMessage) return msg.buttonsMessage.contentText || msg.buttonsMessage.text || '';
  if (msg.templateMessage) {
    const t = msg.templateMessage.hydratedTemplate || msg.templateMessage.hydratedFourRowTemplate || {};
    return t.hydratedContentText || t.hydratedTitleText || '';
  }
  if (msg.interactiveMessage) return msg.interactiveMessage.body?.text || msg.interactiveMessage.header?.title || '';
  if (msg.listMessage) return msg.listMessage.description || msg.listMessage.title || '';
  if (msg.productMessage) return `🛍️ ${msg.productMessage.product?.title || 'Produto'}`;
  if (msg.orderMessage) return `🛒 Encomenda${msg.orderMessage.itemCount ? ` (${msg.orderMessage.itemCount} artigos)` : ''}`;
  if (msg.groupInviteMessage) return `👥 Convite para o grupo ${msg.groupInviteMessage.groupName || ''}`.trim();
  if (msg.callLogMesssage || msg.call) return '📞 Chamada';
  return '';
}

/** Miniatura que o WhatsApp manda com vídeos e imagens (para a pré-visualização) */
export function whatsAppThumbnail(media: any): string | null {
  const raw = media?.jpegThumbnail;
  let b64: string | null = null;
  if (typeof raw === 'string') b64 = raw.replace(/^data:[^;]+;base64,/, '');
  else if (raw?.type === 'Buffer' && Array.isArray(raw.data)) b64 = Buffer.from(raw.data).toString('base64');
  else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    // {0: 255, 1: 216, …} (Uint8Array serializado)
    const bytes = Object.values(raw).filter((v) => typeof v === 'number') as number[];
    if (bytes.length > 0) b64 = Buffer.from(bytes).toString('base64');
  }
  if (!b64 || b64.length < 100 || b64.length > 60_000) return null;
  return `data:image/jpeg;base64,${b64}`;
}
