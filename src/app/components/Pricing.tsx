import { useState } from 'react';
import { Check, Zap, Star, Crown } from 'lucide-react';
import { Button } from './ui/button';
import { trackMetaEvent } from './MetaPixel';

interface PricingProps {
  onSelectPlan?: (planId: string) => void;
}

const plans = [
  {
    name: 'Gratuito',
    icon: Zap,
    iconColor: 'text-gray-700 dark:text-gray-300',
    price: 'Grátis',
    period: '',
    description: 'Para dar os primeiros passos',
    features: [
      'Até 100 leads cadastrados',
      '100 mensagens WhatsApp/mês',
      '50 disparos em massa/mês',
      '1 canal WhatsApp conectado',
      'Painel de métricas básico',
      'Acesso ao marketplace de IA',
      'Suporte por email em até 48h',
    ],
    cta: 'Criar Conta Grátis',
    highlighted: false,
    variant: 'outline' as const,
    trial: false,
  },
  {
    name: 'Business',
    icon: Star,
    iconColor: 'text-blue-600',
    price: 'R$97',
    period: '/mês',
    priceAnnual: 'R$79',
    periodAnnual: '/mês',
    annualNote: 'cobrado anualmente · economize R$216/ano',
    description: 'Para equipes que querem crescer com IA',
    features: [
      'Até 2.000 leads cadastrados',
      '1.000 mensagens WhatsApp/mês',
      '5.000 disparos em massa/mês',
      'Até 5 canais WhatsApp conectados',
      'Assistentes de IA do marketplace',
      'Até 3 assistentes de IA personalizados',
      '1 agente de voz (ligacões automatizadas)',
      'Relatórios detalhados em tempo real',
      'API REST + HTTP endpoint (webhooks)',
      'Todas as integracões nativas (N8N, Meta Ads...)',
      'Suporte prioritário em até 4h',
    ],
    cta: 'Começar Agora',
    highlighted: true,
    popular: true,
    variant: 'default' as const,
    trial: false,
  },
  {
    name: 'Enterprise',
    icon: Crown,
    iconColor: 'text-purple-600',
    price: 'R$197',
    period: '/mês',
    priceAnnual: 'R$159',
    periodAnnual: '/mês',
    annualNote: 'cobrado anualmente · economize R$456/ano',
    description: 'Para operações de alta escala',
    features: [
      'Leads ilimitados',
      'Mensagens WhatsApp ilimitadas',
      'Disparos em massa ilimitados',
      'Canais WhatsApp ilimitados',
      'Assistentes de IA ilimitados (custom + marketplace)',
      'Agentes de voz ilimitados',
      'Tudo do Business, mais:',
      'Gerente de conta dedicado',
      'SLA garantido 99,9% de uptime',
      'Onboarding personalizado',
      'Customizações sob medida',
      'Suporte prioritário 24/7',
    ],
    cta: 'Começar Agora',
    highlighted: false,
    variant: 'outline' as const,
    trial: false,
  },
];

export default function Pricing({ onSelectPlan }: PricingProps) {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');

  return (
    <section id="planos" className="py-16 lg:py-24 bg-gradient-to-b from-[#0f0a1a] to-[#1a1625]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 text-purple-300 rounded-full mb-4">
            <Star className="w-4 h-4" />
            <span className="text-sm font-medium">Planos e Preços</span>
          </div>
          <h2 className="text-white mb-4 text-3xl sm:text-4xl lg:text-5xl font-bold">
            Escolha o plano ideal para você
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-base sm:text-lg">
            Comece grátis e faça upgrade quando precisar. Sem compromissos ou taxas escondidas.
          </p>

          {/* Billing Period Toggle */}
          <div className="flex justify-center mt-8">
            <div className="inline-flex gap-2 bg-white/5 border border-white/10 p-1 rounded-xl">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-6 py-2 text-sm font-medium rounded-lg transition-all ${
                  billingPeriod === 'monthly'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Mensal
              </button>
              <button
                onClick={() => setBillingPeriod('annual')}
                className={`relative px-6 py-2 text-sm font-medium rounded-lg transition-all ${
                  billingPeriod === 'annual'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Anual
                <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full shadow-sm">
                  -20%
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Pricing Cards - Com scroll horizontal no mobile */}
        <div className="md:hidden overflow-x-auto pb-8 -mx-4 px-4">
          <div className="flex gap-6 min-w-max">
            {plans.map((plan, index) => {
              const Icon = plan.icon;
              return (
                <div
                  key={index}
                  className={`relative rounded-2xl p-8 transition-all duration-300 w-[320px] flex-shrink-0 ${
                    plan.highlighted
                      ? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg scale-105 border-2 border-blue-500'
                      : 'bg-card border border-purple-500/20 hover:shadow-xl hover:border-purple-500/40'
                  }`}
                >
                  {/* Popular Badge */}
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1 px-4 py-1 bg-yellow-400 text-gray-900 rounded-full text-sm shadow-lg">
                        <Star className="w-4 h-4 fill-current" />
                        Mais Popular
                      </span>
                    </div>
                  )}

                  {/* Icon & Name */}
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className={`w-12 h-12 ${
                        plan.highlighted ? 'bg-white/20' : 'bg-white'
                      } rounded-xl flex items-center justify-center`}
                    >
                      <Icon className={`w-6 h-6 ${plan.highlighted ? 'text-white' : plan.iconColor}`} />
                    </div>
                    <h3
                      className={`${
                        plan.highlighted ? 'text-white' : 'text-white'
                      } text-xl font-semibold`}
                    >
                      {plan.name}
                    </h3>
                  </div>

                  {/* Price */}
                  <div className="mb-2">
                    <span
                      className={`text-4xl font-bold ${
                        plan.highlighted ? 'text-white' : 'text-white'
                      }`}
                    >
                      {billingPeriod === 'annual' && plan.priceAnnual ? plan.priceAnnual : plan.price}</span>
                    <span
                      className={`text-sm ${
                        plan.highlighted ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {billingPeriod === 'annual' && plan.periodAnnual ? plan.periodAnnual : plan.period}
                    </span>
                    {billingPeriod === 'annual' && (plan as any).annualNote && (
                      <p className={`text-xs mt-1 ${
                        plan.highlighted ? 'text-white/70' : 'text-green-400'
                      }`}>{(plan as any).annualNote}</p>
                    )}
                  </div>

                  <p
                    className={`text-sm mb-4 ${
                      plan.highlighted ? 'text-white/90' : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {plan.description}
                  </p>

                  {/* Trial Badge */}
                  {plan.trial && (
                    <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs mb-6 ${
                      plan.highlighted 
                        ? 'bg-white/20 text-white' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      <Zap className="w-3 h-3" />
                      {plan.trial}
                    </div>
                  )}

                  {/* CTA Button */}
                  <Button
                    className={`w-full mb-8 ${
                      plan.highlighted
                        ? 'bg-white text-blue-600 hover:bg-gray-100 shadow-lg'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                    size="lg"
                    onClick={() => {
                      onSelectPlan && onSelectPlan(plan.name);
                      trackMetaEvent('SelectPlan', { plan: plan.name });
                    }}
                  >
                    {plan.cta}
                  </Button>

                  {/* Features */}
                  <ul className="space-y-3">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <Check
                          className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                            plan.highlighted ? 'text-white' : 'text-blue-600'
                          }`}
                        />
                        <span
                          className={`text-sm ${
                            plan.highlighted ? 'text-white/90' : 'text-gray-300'
                          }`}
                        >
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pricing Cards - Grid para desktop */}
        <div className="hidden md:grid md:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {plans.map((plan, index) => {
            const Icon = plan.icon;
            return (
              <div
                key={index}
                className={`relative rounded-2xl p-8 transition-all duration-300 ${
                  plan.highlighted
                    ? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg scale-105 border-2 border-blue-500'
                    : 'bg-card border border-purple-500/20 hover:shadow-xl hover:border-purple-500/40'
                }`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 px-4 py-1 bg-yellow-400 text-gray-900 rounded-full text-sm shadow-lg">
                      <Star className="w-4 h-4 fill-current" />
                      Mais Popular
                    </span>
                  </div>
                )}

                {/* Icon & Name */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-12 h-12 ${
                      plan.highlighted ? 'bg-white/20' : 'bg-white'
                    } rounded-xl flex items-center justify-center`}
                  >
                    <Icon className={`w-6 h-6 ${plan.highlighted ? 'text-white' : plan.iconColor}`} />
                  </div>
                  <h3
                    className={`${
                      plan.highlighted ? 'text-white' : 'text-white'
                    } text-xl font-semibold`}
                  >
                    {plan.name}
                  </h3>
                </div>

                {/* Price */}
                <div className="mb-2">
                  <span
                    className={`text-4xl font-bold ${
                      plan.highlighted ? 'text-white' : 'text-white'
                    }`}
                  >
                    {billingPeriod === 'annual' && plan.priceAnnual ? plan.priceAnnual : plan.price}</span>
                  <span
                    className={`text-sm ${
                      plan.highlighted ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {billingPeriod === 'annual' && plan.periodAnnual ? plan.periodAnnual : plan.period}
                  </span>
                  {billingPeriod === 'annual' && (plan as any).annualNote && (
                    <p className={`text-xs mt-1 ${
                      plan.highlighted ? 'text-white/70' : 'text-green-400'
                    }`}>{(plan as any).annualNote}</p>
                  )}
                </div>

                <p
                  className={`text-sm mb-4 ${
                    plan.highlighted ? 'text-white/90' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {plan.description}
                </p>

                {/* Trial Badge */}
                {plan.trial && (
                  <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs mb-6 ${
                    plan.highlighted 
                      ? 'bg-white/20 text-white' 
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    <Zap className="w-3 h-3" />
                    {plan.trial}
                  </div>
                )}

                {/* CTA Button */}
                <Button
                  className={`w-full mb-8 ${
                    plan.highlighted
                      ? 'bg-white text-blue-600 hover:bg-gray-100 shadow-lg'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                  size="lg"
                  onClick={() => {
                    onSelectPlan && onSelectPlan(plan.name);
                    trackMetaEvent('SelectPlan', { plan: plan.name });
                  }}
                >
                  {plan.cta}
                </Button>

                {/* Features */}
                <ul className="space-y-3">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <Check
                        className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                          plan.highlighted ? 'text-white' : 'text-blue-600'
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          plan.highlighted ? 'text-white/90' : 'text-gray-300'
                        }`}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Bottom Note */}
        <div className="text-center mt-12">
          <p className="text-gray-400 mb-2">
            🎉 Comece grátis agora - <strong className="text-white">Sem cartão de crédito</strong>
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Cancele quando quiser, sem multas ou burocracias
          </p>
          <p className="text-sm text-blue-400 flex items-center justify-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506L9.18 14.311h1.248c4.57 0 7.266-2.292 8.032-6.828.018-.106.053-.31.086-.563.055-.062.116-.12.178-.18.117-.114.26-.217.46-.217z"/>
            </svg>
            Pagamentos processados com segurança via PayPal
          </p>
        </div>
      </div>
    </section>
  );
}

