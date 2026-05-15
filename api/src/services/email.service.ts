import nodemailer from 'nodemailer';
import { getPasswordResetEmail, getEmailConfirmationEmail, getWelcomeEmail } from '../templates/email.template';

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: any[];
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured = false;

  constructor() {
    this.setupTransporter();
  }

  private setupTransporter() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || 'noreply@leadsflowapi.com';

    // Check if SMTP is configured
    if (smtpHost && smtpPort && smtpUser && smtpPass) {
      try {
        this.transporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(smtpPort, 10),
          secure: parseInt(smtpPort, 10) === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        this.isConfigured = true;
        console.log('[Email] ✅ SMTP configured successfully');
      } catch (error) {
        console.error('[Email] ❌ Failed to configure SMTP:', error);
        this.isConfigured = false;
      }
    } else {
      console.log('[Email] ⚠️  SMTP not configured - emails will be logged to console');
      console.log('[Email] Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS to enable email sending');
      this.isConfigured = false;
    }
  }

  private async sendEmail(options: EmailOptions): Promise<void> {
    const from = process.env.SMTP_FROM || 'LeadsFlow API <noreply@leadsflowapi.com>';

    if (this.isConfigured && this.transporter) {
      try {
        await this.transporter.sendMail({
          from,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
        });
        console.log(`[Email] ✅ Sent email to ${options.to}: ${options.subject}`);
      } catch (error) {
        console.error(`[Email] ❌ Failed to send email to ${options.to}:`, error);
        throw new Error('Failed to send email');
      }
    } else {
      // Development mode - log email to console
      console.log('\n===========================================');
      console.log('📧 EMAIL (Development Mode - Not Sent)');
      console.log('===========================================');
      console.log(`To: ${options.to}`);
      console.log(`Subject: ${options.subject}`);
      console.log('-------------------------------------------');
      console.log(options.text);
      console.log('===========================================\n');
    }
  }

  async sendEmailConfirmation(email: string, token: string, appUrl: string): Promise<void> {
    const subject = 'Confirme seu email - LeadsFlow API';

    const text = `
Olá!

Obrigado por se cadastrar no LeadsFlow API.

Para confirmar seu email, use o código abaixo:

${token}

Este código expira em 24 horas.

Se você não se cadastrou, ignore este email.

Atenciosamente,
Equipe LeadsFlow API
    `.trim();

    const html = getEmailConfirmationEmail(token, appUrl);

    await this.sendEmail({ to: email, subject, text, html });
  }

  async sendPasswordReset(email: string, token: string, appUrl: string): Promise<void> {
    const resetUrl = `${appUrl}#type=recovery&token=${token}`;
    const subject = 'Redefinir senha - LeadsFlow API';

    const text = `
Olá!

Você solicitou a redefinição de senha para sua conta no LeadsFlow API.

Para redefinir sua senha, use o código abaixo:

${token}

Ou clique no link:
${resetUrl}

Este código expira em 1 hora.

Se você não solicitou a redefinição de senha, ignore este email e sua senha permanecerá inalterada.

Atenciosamente,
Equipe LeadsFlow API
    `.trim();

    const html = getPasswordResetEmail(token, resetUrl);

    await this.sendEmail({ to: email, subject, text, html });
  }

  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    const subject = 'Bem-vindo ao LeadsFlow API!';

    const text = `
Olá ${name}!

Bem-vindo ao LeadsFlow API!

Estamos felizes em tê-lo conosco. Você agora tem acesso a todas as funcionalidades da nossa plataforma CRM.

Para começar:
1. Acesse o dashboard
2. Importe seus leads
3. Configure suas integrações

Se precisar de ajuda, nossa documentação está disponível em nosso site.

Atenciosamente,
Equipe LeadsFlow API
    `.trim();

    const html = getWelcomeEmail(name);

    await this.sendEmail({ to: email, subject, text, html });
  }

  async sendEmailWithSettings(options: EmailOptions, settings: any): Promise<void> {
    const { host, port, user, pass, fromEmail, fromName } = settings;

    if (!host || !port || !user || !pass) {
      throw new Error('Configuração SMTP incompleta para envio direto.');
    }

    console.log(`[Email] Creating transporter for ${host}:${port} (user: ${user})`);

    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port, 10),
      secure: parseInt(port, 10) === 465,
      auth: {
        user,
        pass,
      },
      tls: {
        // Aceitar certificados não autorizados se necessário (comum em SMTPs próprios)
        rejectUnauthorized: false
      },
      connectionTimeout: 10000, // 10 segundos para conectar
      greetingTimeout: 10000,   // 10 segundos para o greeting do SMTP
      socketTimeout: 30000,      // 30 segundos para o socket (bom para anexos)
    });

    const from = fromName ? `${fromName} <${fromEmail || user}>` : (fromEmail || user);

    try {
      console.log(`[Email] Sending mail to ${options.to}...`);
      const info = await transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
      });
      console.log(`[Email] ✅ Sent dynamic email to ${options.to}: ${options.subject}. MessageID: ${info.messageId}`);
    } catch (error: any) {
      console.error(`[Email] ❌ Failed to send dynamic email to ${options.to}. Error: ${error.message}`);
      if (error.code === 'ETIMEDOUT') console.error('[Email] Connection timed out');
      throw error;
    } finally {
      transporter.close();
    }
  }

  async sendCampaignEmail(email: string, subject: string, content: string, isHtml: boolean, smtpSettings: any, attachments?: any[]): Promise<void> {
    console.log(`[Email Campaign] Preparing email for ${email} with ${attachments?.length || 0} attachments`);

    const mappedAttachments = (attachments || []).map(a => {
      const hasContent = !!a.content;
      const hasUrl = !!a.url;
      console.log(`[Email Campaign] Processing attachment: ${a.name} (${a.type}), has content: ${hasContent}, has url: ${hasUrl}`);

      if (a.content) {
        const buffer = Buffer.from(a.content, 'base64');
        return {
          filename: a.name,
          content: buffer,
          contentType: a.type
        };
      } else if (a.url) {
        return {
          filename: a.name,
          path: a.url,
          contentType: a.type
        };
      }
      return {
        filename: a.name,
        contentType: a.type
      };
    });

    await this.sendEmailWithSettings({
      to: email,
      subject,
      text: isHtml ? content.replace(/<[^>]*>?/gm, '') : content,
      html: isHtml ? content : `<div style="white-space: pre-wrap;">${content}</div>`,
      attachments: mappedAttachments
    }, smtpSettings);
  }

  async sendTeamInvite(
    email: string,
    recipientName: string,
    inviterName: string,
    workspaceId: string,
    inviteUrl: string,
    smtpSettings?: any
  ): Promise<void> {
    const subject = `${inviterName} convidou-te para o LeadsFlow`;
    const text = `
Olá ${recipientName}!

${inviterName} convidou-te para fazer parte da equipa no LeadsFlow.

Para aceitar o convite, clica no link abaixo:
${inviteUrl}

Este convite expira em 7 dias.

Se não esperavas este convite, podes ignorar este email.

Equipa LeadsFlow
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="520" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:#0066FF;padding:32px 40px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">LeadsFlow</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 16px;color:#111;font-size:20px;">Convite para a equipa</h2>
          <p style="color:#444;line-height:1.6;margin:0 0 24px;">
            <strong>${inviterName}</strong> convidou-te para fazer parte da equipa no LeadsFlow.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${inviteUrl}"
               style="display:inline-block;background:#0066FF;color:#fff;text-decoration:none;
                      padding:14px 32px;border-radius:8px;font-weight:bold;font-size:15px;">
              Aceitar Convite
            </a>
          </div>
          <p style="color:#888;font-size:13px;margin:0;">
            O convite expira em 7 dias.<br>
            Se não esperavas este convite, podes ignorar este email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    if (smtpSettings) {
      await this.sendEmailWithSettings({ to: email, subject, text, html }, smtpSettings);
    } else {
      await this.sendEmail({ to: email, subject, text, html });
    }
  }
}

export const emailService = new EmailService();
