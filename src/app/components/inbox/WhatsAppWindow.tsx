// WhatsApp oficial numa conversa: janela de atendimento de 24 horas e envio de modelos.
// A janela abre (e volta a abrir por 24 h) quando o cliente escreve; os modelos não a abrem.
// O servidor também valida (o painel só evita a tentativa e explica).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AppModal } from '../base/AppModal';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { whatsappCloudInboxApi, type ConversationTemplate, type ServiceWindow } from '../../services/api/inbox';
import type { ConversationWithDetails, MessageWithSender } from '../../types/inbox';

/** Estado da janela da conversa; volta a perguntar quando chega uma mensagem do cliente */
export function useWhatsAppWindow(conversation: ConversationWithDetails, messages: MessageWithSender[]) {
    const isCloud = conversation.channel?.type === 'whatsapp_cloud';
    const [win, setWin] = useState<ServiceWindow | null>(null);
    const [now, setNow] = useState(Date.now());
    // Última mensagem do cliente: quando muda, a janela pode ter (re)aberto
    const lastInboundId = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) if (messages[i].direction === 'in') return messages[i].id;
        return null;
    }, [messages]);

    const refresh = useCallback(() => {
        if (!isCloud) { setWin(null); return; }
        whatsappCloudInboxApi.window(conversation.id).then(setWin).catch(() => setWin(null));
    }, [isCloud, conversation.id]);

    useEffect(() => { refresh(); }, [refresh, lastInboundId]);
    useEffect(() => {
        if (!isCloud) return;
        const t = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(t);
    }, [isCloud]);

    if (!isCloud || !win || !win.applies) return { applies: false, open: true, expiresAt: null as Date | null, refresh };
    const expiresAt = win.expires_at ? new Date(win.expires_at) : null;
    return { applies: true, open: !!expiresAt && expiresAt.getTime() > now, expiresAt, refresh };
}

function remaining(expiresAt: Date, now = Date.now()) {
    const ms = Math.max(0, expiresAt.getTime() - now);
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}

/** Linha no cabeçalho: tempo que falta (ou janela fechada) */
export function WindowBadge({ open, expiresAt }: { open: boolean; expiresAt: Date | null }) {
    if (open && expiresAt) {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400" title="Pode responder livremente até a janela fechar">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {`Janela aberta · ${remaining(expiresAt)}`}
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Janela de 24 h fechada
        </span>
    );
}

/** No lugar da caixa de escrita quando a janela está fechada */
export function ClosedWindowComposer({ onSendTemplate }: { onSendTemplate: () => void }) {
    return (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                O cliente não escreveu nas últimas 24 horas. O WhatsApp só deixa enviar um modelo aprovado; a conversa volta a abrir quando ele responder.
            </p>
            <Button onClick={onSendTemplate}>Enviar modelo de mensagem</Button>
        </div>
    );
}

const fill = (text: string, params: string[]) => String(text || '').replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`);

const CATEGORY: Record<string, string> = { MARKETING: 'Marketing', UTILITY: 'Utilidade', AUTHENTICATION: 'Autenticação' };

/** Escolher um modelo aprovado, preencher as variáveis, ver como fica e enviar */
export function TemplateSendModal({ conversationId, contactName, open, onClose, onSent }: {
    conversationId: string;
    contactName?: string;
    open: boolean;
    onClose: () => void;
    onSent?: () => void;
}) {
    const [templates, setTemplates] = useState<ConversationTemplate[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [picked, setPicked] = useState<string>('');
    const [bodyParams, setBodyParams] = useState<string[]>([]);
    const [headerParams, setHeaderParams] = useState<string[]>([]);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (!open) return;
        setTemplates(null); setError(null); setPicked(''); setBodyParams([]); setHeaderParams([]);
        whatsappCloudInboxApi.templates(conversationId)
            .then(setTemplates)
            .catch((err: any) => { setTemplates([]); setError(err?.response?.data?.error || 'Não foi possível carregar os modelos.'); });
    }, [open, conversationId]);

    const tpl = templates?.find((t) => `${t.name}|${t.language}` === picked) || null;
    useEffect(() => {
        if (!tpl) return;
        // {{1}} costuma ser o nome do cliente: pré-preenche (pode alterar)
        setBodyParams(Array.from({ length: tpl.body_vars }, (_, i) => (i === 0 && contactName ? contactName : '')));
        setHeaderParams(Array.from({ length: tpl.header_vars }, () => ''));
    }, [tpl?.name, tpl?.language]); // eslint-disable-line react-hooks/exhaustive-deps

    const complete = !!tpl && tpl.sendable && bodyParams.every((v) => v.trim()) && headerParams.every((v) => v.trim());

    const send = async () => {
        if (!tpl) return;
        setSending(true);
        try {
            await whatsappCloudInboxApi.sendTemplate(conversationId, {
                name: tpl.name, language: tpl.language, body_params: bodyParams, header_params: headerParams,
            });
            toast.success('Modelo enviado');
            onSent?.();
            onClose();
        } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Não foi possível enviar o modelo');
        } finally {
            setSending(false);
        }
    };

    return (
        <AppModal
            open={open}
            onOpenChange={(v) => { if (!v && !sending) onClose(); }}
            size="md"
            title="Enviar modelo de mensagem"
            footer={(
                <>
                    <Button variant="outline" onClick={onClose} disabled={sending}>Cancelar</Button>
                    <Button onClick={send} disabled={!complete || sending}>{sending ? 'A enviar…' : 'Enviar'}</Button>
                </>
            )}
        >
            <div className="space-y-4">
                {templates === null ? (
                    <p className="text-sm text-muted-foreground">A carregar…</p>
                ) : error ? (
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                ) : templates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Não há modelos aprovados neste número. Crie um em Definições → WhatsApp Business → Modelos e aguarde a aprovação da Meta.
                    </p>
                ) : (
                    <>
                        <div className="space-y-1.5">
                            <Label htmlFor="tpl-pick">Modelo</Label>
                            <select id="tpl-pick" value={picked} onChange={(e) => setPicked(e.target.value)} className="w-full text-sm">
                                <option value="">Escolher modelo</option>
                                {templates.map((t) => (
                                    <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`} disabled={!t.sendable} translate="no">
                                        {t.name} · {t.language} · {CATEGORY[t.category] || t.category}{t.sendable ? '' : ' (não suportado)'}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {tpl && (headerParams.length > 0 || bodyParams.length > 0) && (
                            <div className="space-y-2">
                                {headerParams.map((v, i) => (
                                    <div key={`h${i}`} className="space-y-1">
                                        <Label htmlFor={`tpl-h${i}`}>{`Cabeçalho {{${i + 1}}}`}</Label>
                                        <input id={`tpl-h${i}`} value={v} onChange={(e) => setHeaderParams(headerParams.map((x, j) => (j === i ? e.target.value : x)))} className="w-full" />
                                    </div>
                                ))}
                                {bodyParams.map((v, i) => (
                                    <div key={`b${i}`} className="space-y-1">
                                        <Label htmlFor={`tpl-b${i}`}>{`Variável {{${i + 1}}}`}</Label>
                                        <input id={`tpl-b${i}`} value={v} onChange={(e) => setBodyParams(bodyParams.map((x, j) => (j === i ? e.target.value : x)))} className="w-full" />
                                    </div>
                                ))}
                            </div>
                        )}

                        {tpl && (
                            <div className="space-y-1.5">
                                <Label>Como fica</Label>
                                <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-foreground" translate="no">
                                    {tpl.header && <p className="mb-1 font-semibold">{fill(tpl.header, headerParams)}</p>}
                                    <p className="whitespace-pre-wrap">{fill(tpl.body, bodyParams)}</p>
                                    {tpl.footer && <p className="mt-1 text-xs text-muted-foreground">{tpl.footer}</p>}
                                    {tpl.buttons.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {tpl.buttons.map((b, i) => <span key={i} className="rounded-md border border-border px-2 py-1 text-xs">{b.text}</span>)}
                                        </div>
                                    )}
                                </div>
                                {tpl.category === 'MARKETING' && (
                                    <p className="text-xs text-muted-foreground">Envie modelos de marketing só a quem deu consentimento para os receber.</p>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </AppModal>
    );
}
