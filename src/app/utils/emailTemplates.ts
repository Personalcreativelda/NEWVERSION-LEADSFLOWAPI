export const EMAIL_TEMPLATES = [
    {
        id: 'professional',
        name: 'Profissional Simples',
        html: `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; border-bottom: 2px solid #3B82F6; padding-bottom: 20px; margin-bottom: 20px; }
        .content { background: #f9fafb; padding: 30px; border-radius: 8px; }
        .footer { text-align: center; font-size: 12px; color: #6b7280; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h1 style="color: #3B82F6; margin: 0;">LeadFlow CRM</h1>
    </div>
    <div class="content">
        <h2>Olá, {{name}}!</h2>
        <p>Esta é uma mensagem profissional enviada através do LeadFlow API.</p>
        <p>Você pode personalizar este conteúdo como desejar.</p>
        <p>Atenciosamente,<br><strong>Sua Equipe</strong></p>
    </div>
    <div class="footer">
        <p>Enviado por LeadFlow CRM &copy; 2026</p>
        <p>Se você deseja não receber mais estes e-mails, clique em descadastrar.</p>
    </div>
</body>
</html>`
    },
    {
        id: 'promotion',
        name: 'Promoção / Oferta',
        html: `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; overflow: hidden; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .banner { background: linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%); color: #ffffff; padding: 40px 20px; text-align: center; }
        .content { padding: 30px; text-align: center; }
        .btn { display: inline-block; padding: 15px 30px; background-color: #3B82F6; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px; }
        .footer { padding: 20px; text-align: center; background-color: #f8fafc; font-size: 12px; color: #94a3b8; }
    </style>
</head>
<body>
    <div class="container">
        <div class="banner">
            <h1 style="margin: 0; font-size: 32px;">OFERTA IMPERDÍVEL!</h1>
            <p style="font-size: 18px; margin-top: 10px;">Aproveite antes que acabe</p>
        </div>
        <div class="content">
            <h2>Olá {{name}}!</h2>
            <p style="font-size: 16px; color: #475569;">Temos uma oferta exclusiva selecionada especialmente para você. Não perca esta oportunidade de escalar seus resultados.</p>
            <a href="#" class="btn">APROVEITAR AGORA</a>
        </div>
        <div class="footer">
            <p>Você está recebendo este e-mail porque é um cliente valorizado.<br>&copy; 2026 LeadFlow API</p>
        </div>
    </div>
</body>
</html>`
    },
    {
        id: 'newsletter',
        name: 'Informativo / Newsletter',
        html: `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Helvetica', sans-serif; line-height: 1.5; color: #2d3748; background-color: #f7fafc; padding: 20px; }
        .wrapper { max-width: 650px; margin: 0 auto; background-color: #fff; padding: 40px; border-top: 6px solid #3B82F6; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .item { margin-bottom: 25px; padding-bottom: 15px; border-bottom: 1px solid #edf2f7; }
        .footer { margin-top: 40px; text-align: center; font-size: 0.8em; color: #a0aec0; }
    </style>
</head>
<body>
    <div class="wrapper">
        <h1 style="color: #1a202c; margin-bottom: 30px;">Novidades do Mês</h1>
        
        <div class="item">
            <h3 style="color: #3B82F6;">Notícia Importante 1</h3>
            <p>Olá {{name}}, confira a primeira grande atualização que tivemos em nossa plataforma este mês.</p>
        </div>

        <div class="item">
            <h3 style="color: #3B82F6;">Dica de Produtividade</h3>
            <p>Descubra como você pode utilizar os campos personalizados para organizar melhor seus leads.</p>
        </div>

        <div class="footer">
            <p>LeadFlow API - Sua plataforma de automação inteligente</p>
        </div>
    </div>
</body>
</html>`
    }
];
