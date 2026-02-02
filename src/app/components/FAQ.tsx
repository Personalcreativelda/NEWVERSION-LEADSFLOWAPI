import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

const faqs = [
  {
    question: 'Como funciona o período de teste gratuito?',
    answer:
      'Você tem 7 dias para testar todos os recursos de qualquer plano gratuitamente, sem precisar cadastrar cartão de crédito. Ao final do período, você pode escolher assinar um plano pago ou continuar com a versão Gratuita.',
  },
  {
    question: 'Posso mudar de plano a qualquer momento?',
    answer:
      'Sim! Você pode fazer upgrade ou downgrade do seu plano a qualquer momento. As mudanças são processadas imediatamente e o valor é ajustado proporcionalmente na sua próxima cobrança.',
  },
  {
    question: 'Quais formas de pagamento são aceitas?',
    answer:
      'Aceitamos PayPal e todos os principais cartões de crédito (Visa, Mastercard, American Express). O PayPal oferece segurança adicional e facilidade no gerenciamento de suas assinaturas.',
  },
  {
    question: 'Meus dados estão seguros?',
    answer:
      'Sim! Utilizamos criptografia de ponta a ponta, servidores em nuvem certificados e seguimos as melhores práticas de segurança. Somos totalmente compatíveis com LGPD e GDPR.',
  },
  {
    question: 'Posso integrar o LeadFlow com outras ferramentas?',
    answer:
      'Sim! Oferecemos integrações nativas com as principais ferramentas do mercado, incluindo WhatsApp, Evolution API, Facebook Ads, Google Ads, N8N e muito mais. Também disponibilizamos API REST e HTTP endpoint para integrações customizadas.',
  },
  {
    question: 'Como funciona o suporte ao cliente?',
    answer:
      'Oferecemos suporte por email e WhatsApp. O tempo de resposta varia de acordo com o plano: plano Gratuito tem suporte em até 48h, Business em até 4h, e Enterprise conta com suporte prioritário 24/7.',
  },
  {
    question: 'Posso cancelar minha assinatura a qualquer momento?',
    answer:
      'Sim, você pode cancelar sua assinatura a qualquer momento, sem multas ou taxas adicionais. Você continuará tendo acesso aos recursos do plano até o final do período pago.',
  },
  {
    question: 'Existe limite de leads ou mensagens?',
    answer:
      'O plano Gratuito permite até 100 leads, 100 mensagens WhatsApp individuais e 200 mensagens em massa. O plano Business oferece até 500 leads, 500 mensagens individuais e 1000 mensagens em massa. O plano Enterprise oferece tudo ilimitado - leads, mensagens WhatsApp individuais e mensagens em massa sem restrições. Todos os planos têm validade de 30 dias.',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-16 lg:py-24 bg-gradient-to-b from-[#0f0a1a] via-[#1a1625] to-[#0f0a1a] relative overflow-hidden">
      {/* Animated Background Grid */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMDMiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-40"></div>
      
      {/* Gradient Orbs */}
      <div className="absolute top-20 right-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
      <div className="absolute bottom-20 left-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-full mb-4">
            <HelpCircle className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-purple-300">Perguntas Frequentes</span>
          </div>
          <h2 className="text-white mb-4">Tire suas dúvidas</h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Não encontrou a resposta que procura? Entre em contato conosco pelo
            chat ou email.
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="max-w-3xl mx-auto">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="mb-4 border border-purple-500/20 rounded-xl overflow-hidden hover:border-purple-500/40 transition-all bg-gradient-to-br from-[#2a2435]/50 to-[#1f1a29]/50 backdrop-blur-sm"
            >
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full flex items-center justify-between p-6 text-left bg-transparent hover:bg-purple-500/5 transition-colors"
              >
                <span className="text-white pr-8 font-medium">{faq.question}</span>
                <ChevronDown
                  className={`w-5 h-5 text-purple-400 flex-shrink-0 transition-transform duration-300 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === index ? 'max-h-96' : 'max-h-0'
                }`}
              >
                <div className="p-6 pt-0 text-gray-300 bg-purple-500/5 leading-relaxed">
                  {faq.answer}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-12 p-8 bg-gradient-to-br from-purple-500/10 to-blue-500/10 rounded-2xl max-w-2xl mx-auto border border-purple-500/20 backdrop-blur-sm">
          <h3 className="text-white mb-2">Ainda tem dúvidas?</h3>
          <p className="text-gray-400 mb-6">
            Nossa equipe está pronta para ajudar você
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#"
              className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl transition-all shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50"
            >
              Falar com Suporte
            </a>
            <a
              href="#"
              className="inline-flex items-center justify-center px-6 py-3 border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 rounded-xl transition-all"
            >
              Ver Central de Ajuda
            </a>
          </div>
        </div>
      </div>

      {/* Animation Styles */}
      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
      `}</style>
    </section>
  );
}

