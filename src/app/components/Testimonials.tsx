import { Star, Quote } from 'lucide-react';

const testimonials = [
  {
    name: 'Ana Carolina Silva',
    role: 'Diretora de Vendas',
    company: 'TechSolutions',
    image: 'https://images.unsplash.com/photo-1655249493799-9cee4fe983bb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzcyUyMHdvbWFuJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzY0MDE5NDg5fDA&ixlib=rb-4.1.0&q=80&w=400',
    rating: 5,
    content:
      'LeadFlow CRM transformou completamente nossa operação comercial. Aumentamos nossa taxa de conversão em 40% nos primeiros 3 meses. A interface é intuitiva e os relatórios são extremamente úteis.',
  },
  {
    name: 'Ricardo Mendes',
    role: 'CEO',
    company: 'StartHub',
    image: 'https://images.unsplash.com/photo-1629507208649-70919ca33793?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzcyUyMG1hbiUyMHBvcnRyYWl0fGVufDF8fHx8MTc2NDAyMDQwN3ww&ixlib=rb-4.1.0&q=80&w=400',
    rating: 5,
    content:
      'Testamos diversos CRMs antes de encontrar o LeadFlow. A diferença está na simplicidade e na automação inteligente. Nossa equipe adotou a ferramenta em menos de uma semana.',
  },
  {
    name: 'Juliana Costa',
    role: 'Gerente de Marketing',
    company: 'Growth Agency',
    image: 'https://images.unsplash.com/photo-1762522921456-cdfe882d36c3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjB3b21hbiUyMHNtaWxpbmclMjBoZWFkc2hvdHxlbnwxfHx8fDE3NjQwNzcyODN8MA&ixlib=rb-4.1.0&q=80&w=400',
    rating: 5,
    content:
      'O que mais me impressiona é a qualidade do suporte e as atualizações constantes. Cada novo recurso realmente resolve problemas reais que enfrentamos no dia a dia.',
  },
];

export default function Testimonials() {
  return (
    <section id="depoimentos" className="py-16 lg:py-24 bg-gradient-to-b from-[#0f0a1a] via-[#1a1625] to-[#0f0a1a] relative overflow-hidden">
      {/* Animated Background Grid */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMDMiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-40"></div>
      
      {/* Gradient Orbs */}
      <div className="absolute top-20 left-1/4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
      <div className="absolute bottom-20 right-1/4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-full mb-4">
            <Star className="w-4 h-4 text-purple-400 fill-current" />
            <span className="text-sm text-purple-300">Depoimentos</span>
          </div>
          <h2 className="text-white mb-4">
            Mais de 10.000 clientes satisfeitos
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Veja o que nossos clientes estão dizendo sobre o LeadFlow CRM
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="bg-gradient-to-br from-[#2a2435] to-[#1f1a29] rounded-2xl p-8 shadow-xl hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border border-purple-500/20 hover:border-purple-500/40 relative group"
            >
              {/* Quote Icon */}
              <div className="absolute top-6 right-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <Quote className="w-16 h-16 text-purple-400" />
              </div>

              {/* Rating */}
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star
                    key={i}
                    className="w-5 h-5 text-yellow-400 fill-current"
                  />
                ))}
              </div>

              {/* Content */}
              <p className="text-gray-300 mb-6 relative z-10 leading-relaxed">
                "{testimonial.content}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-4 pt-6 border-t border-purple-500/20">
                <img 
                  src={testimonial.image} 
                  alt={testimonial.name}
                  className="w-14 h-14 rounded-full object-cover ring-2 ring-purple-500/30 flex-shrink-0"
                />
                <div>
                  <p className="text-white font-semibold">{testimonial.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {testimonial.role} • {testimonial.company}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-16 max-w-4xl mx-auto">
          <div className="text-center">
            <p className="text-purple-400 mb-2 text-3xl font-bold">10.000+</p>
            <p className="text-sm text-gray-400 font-medium">Clientes Ativos</p>
          </div>
          <div className="text-center">
            <p className="text-blue-400 mb-2 text-3xl font-bold">4.9/5</p>
            <p className="text-sm text-gray-400 font-medium">Avaliação Média</p>
          </div>
          <div className="text-center">
            <p className="text-purple-400 mb-2 text-3xl font-bold">98%</p>
            <p className="text-sm text-gray-400 font-medium">Satisfação</p>
          </div>
          <div className="text-center">
            <p className="text-blue-400 mb-2 text-3xl font-bold">24/7</p>
            <p className="text-sm text-gray-400 font-medium">Suporte</p>
          </div>
        </div>
      </div>
    </section>
  );
}

