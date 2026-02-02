import { Zap, Facebook, Instagram, Linkedin, Twitter, Youtube, Mail } from 'lucide-react';

const footerLinks = {
  product: [
    { label: 'Recursos', href: '#recursos' },
    { label: 'Planos', href: '#planos' },
    { label: 'Integrações', href: '#' },
    { label: 'API', href: '#' },
    { label: 'Atualizações', href: '#' },
  ],
  company: [
    { label: 'Sobre nós', href: '#' },
    { label: 'Blog', href: '#' },
    { label: 'Carreiras', href: '#' },
    { label: 'Imprensa', href: '#' },
    { label: 'Parceiros', href: '#' },
  ],
  resources: [
    { label: 'Central de Ajuda', href: '#' },
    { label: 'Tutoriais', href: '#' },
    { label: 'Comunidade', href: '#' },
    { label: 'Webinars', href: '#' },
    { label: 'Status', href: '#' },
  ],
  legal: [
    { label: 'Privacidade', href: '#' },
    { label: 'Termos de Uso', href: '#' },
    { label: 'Segurança', href: '#' },
    { label: 'LGPD', href: '#' },
    { label: 'Cookies', href: '#' },
  ],
};

const socialLinks = [
  { icon: Facebook, href: '#', label: 'Facebook' },
  { icon: Instagram, href: '#', label: 'Instagram' },
  { icon: Linkedin, href: '#', label: 'LinkedIn' },
  { icon: Twitter, href: '#', label: 'Twitter' },
  { icon: Youtube, href: '#', label: 'YouTube' },
];

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gradient-to-b from-[#0f0a1a] to-[#0a0610] text-gray-300 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMDIiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-50"></div>
      <div className="absolute top-0 left-1/3 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5"></div>
      <div className="absolute bottom-0 right-1/3 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5"></div>
      
      {/* Main Footer */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <span className="text-white text-xl font-semibold">LeadsFlow API</span>
            </div>
            <p className="text-gray-400 mb-6 max-w-sm leading-relaxed">
              A solução completa para gerenciar seus leads, automatizar processos
              e aumentar suas vendas com inteligência.
            </p>

            {/* Support Email */}
            <div className="mb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Suporte:</p>
              <a
                href="mailto:suporte@leadsflowapi.com"
                className="text-purple-400 hover:text-purple-300 transition-colors text-sm flex items-center gap-2 group"
              >
                <Mail className="w-4 h-4" />
                <span className="group-hover:underline">suporte@leadsflowapi.com</span>
              </a>
            </div>

            {/* Newsletter */}
            <div className="mb-6">
              <p className="text-sm text-gray-400 mb-3">
                Receba novidades e dicas
              </p>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <input
                    type="email"
                    placeholder="Seu email"
                    className="w-full pl-10 pr-4 py-2 bg-muted border border-purple-500/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  />
                </div>
                <button className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg transition-all text-sm shadow-lg shadow-purple-500/30">
                  Assinar
                </button>
              </div>
            </div>

            {/* Social Links */}
            <div className="flex gap-3">
              {socialLinks.map((social) => {
                const Icon = social.icon;
                return (
                  <a
                    key={social.label}
                    href={social.href}
                    aria-label={social.label}
                    className="w-9 h-9 bg-muted hover:bg-purple-500/20 border border-purple-500/20 hover:border-purple-500/40 rounded-lg flex items-center justify-center transition-all group"
                  >
                    <Icon className="w-4 h-4 text-gray-400 group-hover:text-purple-400 transition-colors" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="text-white mb-4 font-semibold">Produto</h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-purple-400 transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h4 className="text-white mb-4 font-semibold">Empresa</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-purple-400 transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources Links */}
          <div>
            <h4 className="text-white mb-4 font-semibold">Recursos</h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-purple-400 transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="text-white mb-4 font-semibold">Legal</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-purple-400 transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-purple-500/10 relative z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center md:text-left">
              © {currentYear} LeadsFlowAPI. Todos os direitos reservados.
            </p>
            <div className="flex flex-col md:flex-row items-center gap-3 md:gap-6">
              <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
                <a href="#" className="hover:text-purple-400 transition-colors">
                  Política de Privacidade
                </a>
                <a href="#" className="hover:text-purple-400 transition-colors">
                  Termos de Serviço
                </a>
                <a href="#" className="hover:text-purple-400 transition-colors">
                  Cookies
                </a>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Desenvolvido por <span className="text-purple-400 font-medium">PersonalCreativeLda</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

