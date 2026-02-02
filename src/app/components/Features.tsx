import {
  LayoutDashboard,
  Filter,
  BarChart3,
  Users,
  Zap,
  Shield,
  Globe,
  Smartphone,
} from 'lucide-react';

const features = [
  {
    icon: LayoutDashboard,
    title: 'Painel de Controle Inteligente',
    description:
      'Visualize todas as suas métricas importantes em um único lugar. Dashboard personalizável e intuitivo.',
    gradient: 'from-blue-500 to-blue-600',
  },
  {
    icon: Filter,
    title: 'Filtros e Relatórios em Tempo Real',
    description:
      'Filtre leads por origem, status, período e mais. Gere relatórios detalhados instantaneamente.',
    gradient: 'from-purple-500 to-purple-600',
  },
  {
    icon: BarChart3,
    title: 'Gráficos Interativos e Indicadores',
    description:
      'Acompanhe tendências com gráficos dinâmicos. KPIs atualizados automaticamente.',
    gradient: 'from-indigo-500 to-indigo-600',
  },
  {
    icon: Users,
    title: 'Gestão de Leads e Planos Integrados',
    description:
      'Gerencie todo o ciclo de vida dos leads. Integração perfeita com seus planos de vendas.',
    gradient: 'from-cyan-500 to-cyan-600',
  },
  {
    icon: Zap,
    title: 'Automações Poderosas',
    description:
      'Configure fluxos automatizados de follow-up e nutrição. Economize tempo e aumente conversões.',
    gradient: 'from-yellow-500 to-orange-500',
  },
  {
    icon: Shield,
    title: 'Segurança e Privacidade',
    description:
      'Seus dados protegidos com criptografia de ponta. Conformidade total com LGPD e GDPR.',
    gradient: 'from-green-500 to-green-600',
  },
  {
    icon: Globe,
    title: 'Acesso de Qualquer Lugar',
    description:
      'Trabalhe de onde estiver. Sincronização em tempo real entre todos os dispositivos.',
    gradient: 'from-pink-500 to-pink-600',
  },
  {
    icon: Smartphone,
    title: 'Mobile First',
    description:
      'Interface otimizada para dispositivos móveis. Gerencie seus leads em movimento.',
    gradient: 'from-violet-500 to-violet-600',
  },
];

export default function Features() {
  return (
    <section id="recursos" className="py-16 lg:py-24 bg-gradient-to-b from-[#0f0a1a] to-[#1a1625]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 text-purple-300 rounded-full mb-4">
            <Zap className="w-4 h-4" />
            <span className="text-sm font-medium">Recursos Poderosos</span>
          </div>
          <h2 className="text-white mb-4 text-3xl sm:text-4xl lg:text-5xl font-bold">
            Tudo que você precisa para vender mais
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-base sm:text-lg">
            LeadsFlow API oferece ferramentas completas para captar, qualificar e
            converter leads de forma eficiente.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="group relative bg-card rounded-2xl p-6 hover:bg-muted transition-all duration-300 hover:-translate-y-1 border border-purple-500/10 hover:border-purple-500/30"
              >
                {/* Icon */}
                <div
                  className={`w-12 h-12 bg-gradient-to-br ${feature.gradient} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg`}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>

                {/* Content */}
                <h3 className="text-white mb-2 font-semibold text-lg">{feature.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{feature.description}</p>

                {/* Hover Effect */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-12">
          <p className="text-gray-400 mb-4">
            Explore todos os recursos gratuitamente
          </p>
          <a
            href="#planos"
            className="inline-flex items-center text-purple-400 hover:text-purple-300 transition-colors group font-medium"
          >
            Ver todos os planos
            <svg
              className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}

