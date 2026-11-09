// Emails do LeadsFlow: um só desenho para todos (boas-vindas, confirmar email, recuperar a
// palavra-passe, avisos da administração e emails de marketing para os utilizadores).
// Tabelas e estilos em linha: é o que o Gmail, o Outlook e o Apple Mail mostram bem.
// O logótipo é um PNG público (o Gmail e o Outlook não mostram SVG).

const APP_URL = () => (process.env.FRONTEND_URL || process.env.APP_URL || 'https://app.leadsflowapi.com').replace(/\/$/, '');
const LOGO_URL = () => process.env.EMAIL_LOGO_URL || 'https://app.leadsflowapi.com/email/logo.png';

// Empresa (tem de coincidir com COMPANY em src/app/components/public/PublicPageShell.tsx)
const COMPANY = { name: 'Personalcreativelda', address: 'EN1, Paragem Facim, Marracuene, Moçambique' };

const BLUE = '#2563EB';
const TEXT = '#1F2937';
const MUTED = '#6B7280';
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`;

export const escapeHtml = (v: string) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Texto simples → parágrafos (linhas em branco separam parágrafos, as outras viram <br>) */
export function textToHtml(text: string): string {
  return String(text || '')
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${TEXT};">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export interface BrandedEmail {
  /** Texto que aparece ao lado do assunto na caixa de entrada */
  preheader?: string;
  /** Etiqueta pequena por cima do título (ex.: "Segurança", "Administração") */
  eyebrow?: string;
  title: string;
  /** HTML já seguro (use textToHtml/escapeHtml) */
  bodyHtml: string;
  /** Código de verificação em destaque */
  code?: string;
  button?: { label: string; url: string };
  /** Nota em caixa cinzenta (validade, "se não foi você"…) */
  note?: string;
  /** Linha final no rodapé (ex.: como deixar de receber) */
  footerNote?: string;
  /** "Equipa LeadsFlow" no fim (desligado quando a mensagem já traz a assinatura) */
  signature?: boolean;
}

function buttonHtml(label: string, url: string): string {
  // Botão "à prova de Outlook": tabela com fundo + ligação
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr>
    <td align="center" bgcolor="${BLUE}" style="border-radius:8px;background:${BLUE};">
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener"
        style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;">
        ${escapeHtml(label)}
      </a>
    </td>
  </tr>
</table>`;
}

function codeHtml(code: string): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;">
  <tr>
    <td align="center" style="background:#F3F6FF;border:1px solid #DCE4FF;border-radius:10px;padding:18px 12px;">
      <div style="font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:10px;color:${TEXT};">${escapeHtml(code)}</div>
    </td>
  </tr>
</table>`;
}

/** O desenho de todos os emails do LeadsFlow */
export function renderBrandedEmail(e: BrandedEmail): string {
  const app = APP_URL();
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(e.title)}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;-webkit-text-size-adjust:100%;">
  ${e.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(e.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F4F6;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
          <!-- Logótipo -->
          <tr>
            <td style="padding:0 4px 20px;">
              <a href="${app}" target="_blank" rel="noopener" style="text-decoration:none;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;"><img src="${LOGO_URL()}" width="36" height="36" alt="LeadsFlow" style="display:block;border:0;border-radius:9px;"></td>
                    <td style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:19px;font-weight:700;color:#111827;letter-spacing:-0.2px;">LeadsFlow</td>
                  </tr>
                </table>
              </a>
            </td>
          </tr>
          <!-- Cartão -->
          <tr>
            <td style="background:#ffffff;border:1px solid #E5E7EB;border-radius:14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:4px;background:${BLUE};border-radius:14px 14px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td style="padding:32px 32px 12px;font-family:${FONT};">
                    ${e.eyebrow ? `<p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:${BLUE};">${escapeHtml(e.eyebrow)}</p>` : ''}
                    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:#111827;">${escapeHtml(e.title)}</h1>
                    ${e.bodyHtml}
                    ${e.code ? codeHtml(e.code) : ''}
                    ${e.button ? buttonHtml(e.button.label, e.button.url) : ''}
                    ${e.note ? `<p style="margin:0 0 20px;padding:12px 14px;background:#F9FAFB;border-radius:8px;font-size:13px;line-height:1.55;color:${MUTED};">${escapeHtml(e.note)}</p>` : ''}
                  </td>
                </tr>
                ${e.signature === false ? '<tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>' : `<tr>
                  <td style="padding:0 32px 28px;font-family:${FONT};font-size:14px;line-height:1.6;color:${MUTED};">
                    Equipa LeadsFlow
                  </td>
                </tr>`}
              </table>
            </td>
          </tr>
          <!-- Rodapé -->
          <tr>
            <td align="center" style="padding:20px 16px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:#9CA3AF;">
              ${e.footerNote ? `${escapeHtml(e.footerNote)}<br>` : ''}
              <a href="${app}" target="_blank" rel="noopener" style="color:#6B7280;text-decoration:underline;">app.leadsflowapi.com</a>
              &nbsp;·&nbsp;
              <a href="${app}/privacidade" target="_blank" rel="noopener" style="color:#6B7280;text-decoration:underline;">Privacidade</a>
              <br>© ${year} ${COMPANY.name} · ${COMPANY.address}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Emails da conta ─────────────────────────────────────────────────────────

export const getEmailConfirmationEmail = (token: string, _appUrl?: string) =>
  renderBrandedEmail({
    preheader: `O seu código é ${token}`,
    eyebrow: 'Confirmar email',
    title: 'Confirme o seu email',
    bodyHtml: textToHtml('Obrigado por criar a sua conta no LeadsFlow.\n\nEscreva este código na página de confirmação para ativar a conta:'),
    code: token,
    note: 'O código é válido durante 24 horas. Se não criou uma conta, pode ignorar este email.',
  });

export const getPasswordResetEmail = (token: string, resetUrl: string) =>
  renderBrandedEmail({
    preheader: `Código para redefinir a palavra-passe: ${token}`,
    eyebrow: 'Segurança',
    title: 'Redefinir a palavra-passe',
    bodyHtml: textToHtml('Recebemos um pedido para redefinir a palavra-passe da sua conta LeadsFlow.\n\nUse este código ou o botão abaixo:'),
    code: token,
    button: { label: 'Redefinir palavra-passe', url: resetUrl },
    note: 'O código é válido durante 1 hora. Se não pediu esta alteração, ignore este email: a sua palavra-passe continua a mesma.',
  });

export const getWelcomeEmail = (name: string) => {
  const app = APP_URL();
  const first = String(name || '').trim().split(/\s+/)[0];
  const steps = [
    ['Ligue os seus canais', 'WhatsApp, Instagram, Facebook e email numa só caixa de entrada.'],
    ['Importe os seus contactos', 'Traga os leads de uma folha de cálculo ou do WhatsApp.'],
    ['Ative um assistente de IA', 'Responde aos clientes e marca reuniões por si, 24 horas por dia.'],
  ];
  const list = steps.map(([t, d], i) => `
<tr>
  <td style="vertical-align:top;padding:0 12px 14px 0;width:28px;">
    <div style="width:26px;height:26px;border-radius:13px;background:#EFF4FF;color:${BLUE};font-family:${FONT};font-size:13px;font-weight:700;line-height:26px;text-align:center;">${i + 1}</div>
  </td>
  <td style="vertical-align:top;padding:0 0 14px;font-family:${FONT};">
    <div style="font-size:15px;font-weight:600;color:#111827;">${escapeHtml(t)}</div>
    <div style="font-size:14px;line-height:1.5;color:${MUTED};">${escapeHtml(d)}</div>
  </td>
</tr>`).join('');
  return renderBrandedEmail({
    preheader: 'A sua conta está pronta. Três passos para começar.',
    title: first && first !== 'User' ? `Bem-vindo ao LeadsFlow, ${first}!` : 'Bem-vindo ao LeadsFlow!',
    bodyHtml: `${textToHtml('A sua conta está pronta. Para tirar partido do LeadsFlow desde o primeiro dia:')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 12px;">${list}</table>`,
    button: { label: 'Abrir o LeadsFlow', url: `${app}/dashboard` },
  });
};

// ── Administração ───────────────────────────────────────────────────────────

/** Aviso para o administrador (mesmo texto da notificação do sino) */
export const getAdminNotificationEmail = (title: string, description: string) =>
  renderBrandedEmail({
    preheader: description.slice(0, 120),
    eyebrow: 'Administração',
    title,
    bodyHtml: textToHtml(description),
    button: { label: 'Abrir o painel', url: APP_URL() },
    footerNote: 'Pode desligar estes avisos em Admin → Definições.',
  });

/**
 * Email de marketing da administração para um utilizador. Texto simples ou HTML curto vai
 * dentro do desenho do LeadsFlow; um email HTML completo (com <html> ou <body>) segue tal como foi escrito.
 */
export function getMarketingEmail(opts: { subject: string; message: string; isHtml?: boolean; buttonLabel?: string; buttonUrl?: string }): string {
  const msg = String(opts.message || '');
  if (opts.isHtml && /<(html|body)[\s>]/i.test(msg)) return msg;
  const signed = /(equipa|equipe|atenciosamente|cumprimentos|obrigad[oa])[^\n]*\s*$/i.test(msg.replace(/<[^>]+>/g, '\n').trim().split(/\n/).slice(-3).join('\n'));
  const url = opts.buttonUrl && /^https?:\/\//i.test(opts.buttonUrl) ? opts.buttonUrl : '';
  return renderBrandedEmail({
    preheader: (opts.isHtml ? msg.replace(/<[^>]+>/g, ' ') : msg).replace(/\s+/g, ' ').trim().slice(0, 120),
    title: opts.subject,
    // HTML vem da administração (quem envia é o administrador, não um visitante)
    bodyHtml: opts.isHtml ? `<div style="font-size:15px;line-height:1.65;color:${TEXT};">${msg}</div>` : textToHtml(msg),
    signature: !signed,
    button: url ? { label: opts.buttonLabel?.trim() || 'Saber mais', url } : undefined,
    footerNote: 'Recebeu este email porque tem uma conta no LeadsFlow.',
  });
}

// Compatibilidade com código antigo
export const getEmailTemplate = (content: string) =>
  renderBrandedEmail({ title: 'LeadsFlow', bodyHtml: content });
