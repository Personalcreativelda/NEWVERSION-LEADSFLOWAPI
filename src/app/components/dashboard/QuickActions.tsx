import { useState } from 'react';
import { Plus, MessageSquare, Mail, Users, X, Zap } from 'lucide-react';

interface QuickActionsProps {
  onNovoLead: () => void;
  onMassMessage: () => void;
  onEmailMarketing: () => void;
  onNavigate?: (page: string) => void;
}

export default function QuickActions({ onNovoLead, onMassMessage, onEmailMarketing, onNavigate }: QuickActionsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const actions = [
    {
      label: 'Novo Lead',
      icon: Users,
      color: '#5B9FED', // Azul
      bgColor: 'bg-[#5B9FED]',
      hoverBg: 'hover:bg-[#4A8FDD]',
      onClick: () => {
        onNovoLead();
        setIsOpen(false);
      },
    },
    {
      label: 'Campanhas',
      icon: Zap,
      color: '#25D366', // Verde
      bgColor: 'bg-[#25D366]',
      hoverBg: 'hover:bg-[#20BD5A]',
      onClick: () => {
        onNavigate?.('campaigns');
        setIsOpen(false);
      },
    },
    {
      label: 'Email Marketing',
      icon: Mail,
      color: '#FF6B9D', // Rosa
      bgColor: 'bg-[#FF6B9D]',
      hoverBg: 'hover:bg-[#EF5B8D]',
      onClick: () => {
        onEmailMarketing();
        setIsOpen(false);
      },
    },
  ];

  return (
    <div className="fixed bottom-8 right-8 z-40">
      {/* Action Buttons */}
      <div 
        className={`flex flex-col-reverse gap-3 mb-3 transition-all duration-300 ${
          isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        {actions.map((action, index) => {
          const Icon = action.icon;
          return (
            <button
              key={index}
              onClick={action.onClick}
              className={`group ${action.bgColor} ${action.hoverBg} text-white px-5 py-3 rounded-xl shadow-lg hover:shadow-md transition-all duration-300 flex items-center gap-3 min-w-[200px] hover:scale-105`}
              style={{
                transitionDelay: isOpen ? `${index * 50}ms` : '0ms',
                boxShadow: `0 10px 30px ${action.color}40`
              }}
            >
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                <Icon className="w-5 h-5" />
              </div>
              <span className="font-semibold">{action.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-16 h-16 bg-[#B794F6] hover:bg-[#A784E6] text-white rounded-full shadow-xl hover:shadow-lg transition-all duration-300 flex items-center justify-center group ${
          isOpen ? 'rotate-45' : 'rotate-0'
        }`}
        style={{ boxShadow: '0 10px 30px #B794F640' }}
      >
        {isOpen ? (
          <X className="w-7 h-7" />
        ) : (
          <Zap className="w-7 h-7" />
        )}
      </button>
    </div>
  );
}

