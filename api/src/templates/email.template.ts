// Email templates inspirados no Hostinger

export const getEmailTemplate = (content: string) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LeadsFlow API</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f5f5f7;
    }
    .email-wrapper {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 20px;
      text-align: center;
    }
    .logo {
      font-size: 28px;
      font-weight: bold;
      color: #ffffff;
      text-decoration: none;
      display: inline-block;
    }
    .content {
      padding: 40px 30px;
      color: #333333;
    }
    .content h1 {
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 20px 0;
      color: #1a1a1a;
    }
    .content p {
      font-size: 16px;
      line-height: 1.6;
      margin: 0 0 15px 0;
      color: #555555;
    }
    .button {
      display: inline-block;
      padding: 14px 32px;
      margin: 25px 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
    }
    .button:hover {
      background: linear-gradient(135deg, #5568d3 0%, #6a3f92 100%);
    }
    .note {
      background-color: #f8f9fa;
      border-left: 4px solid #667eea;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .note p {
      margin: 0;
      font-size: 14px;
      color: #666666;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 30px 20px;
      text-align: center;
      border-top: 1px solid #e5e5e5;
    }
    .footer p {
      font-size: 13px;
      color: #888888;
      margin: 5px 0;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="header">
      <div class="logo">LeadsFlow API</div>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} PersonalCreativeLda. Todos os direitos reservados.</p>
      <p style="margin-top: 10px;">
        Este é um email automático, por favor não responda.
      </p>
    </div>
  </div>
</body>
</html>
`;

export const getPasswordResetEmail = (token: string, resetUrl: string) => {
  const content = `
    <h1>Redefinir Senha</h1>
    <p>Olá,</p>
    <p>Recebemos uma solicitação para redefinir a senha da sua conta LeadsFlow API.</p>
    <p>Para criar uma nova senha, clique no botão abaixo:</p>
    <center>
      <a href="${resetUrl}" class="button">Redefinir Senha</a>
    </center>
    <div class="note">
      <p><strong>Nota:</strong> Este link é válido por 1 hora. Se você não solicitou a redefinição de senha, pode ignorar este email com segurança.</p>
    </div>
    <p>Se o botão não funcionar, copie e cole este link no seu navegador:</p>
    <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
  `;

  return getEmailTemplate(content);
};

export const getEmailConfirmationEmail = (token: string, appUrl: string) => {
  const content = `
    <h1>Confirme seu Email</h1>
    <p>Olá,</p>
    <p>Obrigado por se cadastrar no LeadsFlow API!</p>
    <p>Para ativar sua conta, use o código de verificação abaixo:</p>
    <center>
      <div style="background-color: #f8f9fa; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; display: inline-block;">
        <span style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 8px;">${token}</span>
      </div>
    </center>
    <div class="note">
      <p><strong>Nota:</strong> Este código é válido por 24 horas.</p>
    </div>
  `;

  return getEmailTemplate(content);
};

export const getWelcomeEmail = (name: string) => {
  const content = `
    <h1>Bem-vindo ao LeadsFlow API! 🎉</h1>
    <p>Olá${name ? ` ${name}` : ''},</p>
    <p>É um prazer ter você conosco! Sua conta foi criada com sucesso.</p>
    <p>Agora você pode começar a gerenciar seus leads de forma inteligente e eficiente.</p>
    <p><strong>Recursos principais:</strong></p>
    <ul style="color: #555555; line-height: 1.8;">
      <li>Gestão completa de leads</li>
      <li>Integração com WhatsApp</li>
      <li>Dashboard analítico</li>
      <li>Automações personalizadas</li>
    </ul>
    <div class="note">
      <p>Precisa de ajuda? Entre em contato com nosso suporte a qualquer momento.</p>
    </div>
  `;

  return getEmailTemplate(content);
};
