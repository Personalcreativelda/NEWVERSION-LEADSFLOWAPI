import { X, MessageCircle, Mail, MessageSquare } from 'lucide-react';
import { useState } from 'react';

interface ChannelSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectChannel: (channel: 'whatsapp' | 'email' | 'sms') => void;
}

export default function ChannelSelectorModal({ isOpen, onClose, onSelectChannel }: ChannelSelectorModalProps) {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  if (!isOpen) return null;

  const channels = [
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: MessageCircle,
      description: 'Envie mensagens diretas e personalizadas',
      available: true,
      bgGradient: 'bg-gradient-to-br from-[#25D366] to-[#128C7E]',
      borderColor: 'border-[#25D366]',
      buttonBg: 'bg-[#25D366] hover:bg-[#128C7E]',
      shadowHover: 'shadow-[0_12px_24px_rgba(37,211,102,0.15)]',
    },
    {
      id: 'email',
      name: 'Email',
      icon: Mail,
      description: 'Campanhas profissionais por email',
      available: true,
      bgGradient: 'bg-gradient-to-br from-[#3B82F6] to-[#1E40AF]',
      borderColor: 'border-[#3B82F6]',
      buttonBg: 'bg-[#3B82F6] hover:bg-[#2563EB]',
      shadowHover: 'shadow-[0_12px_24px_rgba(59,130,246,0.15)]',
    },
    {
      id: 'sms',
      name: 'SMS',
      icon: MessageSquare,
      description: 'Mensagens curtas e diretas',
      available: false,
      bgGradient: 'bg-gray-200',
      borderColor: '',
      buttonBg: '',
      shadowHover: '',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="surface-default border border-border rounded-xl sm:rounded-2xl shadow-xl max-w-4xl w-full mx-auto overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="relative px-4 sm:px-8 py-4 sm:py-6 border-b border-border surface-muted">
          <div className="pr-10">
            <h2 className="text-xl sm:text-3xl font-bold text-foreground mb-1 sm:mb-2">Criar Nova Campanha</h2>
            <p className="text-subtle text-sm sm:text-base">Escolha o canal de envio para sua campanha</p>
          </div>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 text-subtle hover:text-foreground transition-colors p-2 hover:bg-muted rounded-lg group"
          >
            <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-8 surface-default">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {channels.map((channel, index) => {
              const Icon = channel.icon;
              const isDisabled = !channel.available;
              const isHovered = hoveredCard === channel.id;
              
              return (
                <div
                  key={channel.id}
                  onClick={() => {
                    if (channel.available) {
                      onSelectChannel(channel.id as 'whatsapp' | 'email' | 'sms');
                      onClose();
                    }
                  }}
                  onMouseEnter={() => channel.available && setHoveredCard(channel.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  className={`
                    relative overflow-hidden rounded-xl sm:rounded-2xl border-2 p-4 sm:p-8 text-center
                    transition-all duration-300 ease-out
                    ${isDisabled
                      ? 'border-border surface-muted cursor-not-allowed opacity-60'
                      : `border-border surface-default cursor-pointer hover:border-transparent ${
                          isHovered ? `${channel.shadowHover} -translate-y-2` : ''
                        }`
                    }
                  `}
                  style={{
                    animationDelay: `${index * 100}ms`,
                    animationFillMode: 'both',
                    animationName: 'slideUp',
                    animationDuration: '400ms',
                    animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {/* Animated Top Border */}
                  {channel.available && (
                    <div 
                      className={`absolute top-0 left-0 right-0 h-1 ${channel.bgGradient} transition-all duration-300 ${
                        isHovered ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                  )}

                  {/* Animated Background Gradient on Hover */}
                  {channel.available && isHovered && (
                    <div 
                      className={`absolute inset-0 ${channel.bgGradient} opacity-[0.03] transition-opacity duration-300`}
                    />
                  )}

                  {/* Coming Soon Badge */}
                  {!channel.available && (
                    <div className="absolute top-4 right-4 bg-gradient-to-r from-amber-100 to-yellow-100 dark:from-amber-900/30 dark:to-yellow-900/30 text-amber-800 dark:text-amber-400 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm border border-amber-200 dark:border-amber-700">
                      Em breve
                    </div>
                  )}
                  
                  {/* Icon */}
                  <div className="mb-4 sm:mb-6 relative">
                    <div
                      className={`
                        w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-xl sm:rounded-2xl flex items-center justify-center
                        transition-all duration-300
                        ${isDisabled
                          ? 'bg-muted'
                          : channel.bgGradient
                        }
                        ${isHovered && channel.available ? 'scale-110 rotate-3' : 'scale-100 rotate-0'}
                      `}
                    >
                      <Icon
                        className={`w-6 h-6 sm:w-9 sm:h-9 text-white transition-all duration-300 ${
                          isHovered && channel.available ? 'scale-110' : 'scale-100'
                        }`}
                        strokeWidth={2.5}
                      />
                    </div>

                    {/* Pulsing Ring on Hover */}
                    {channel.available && isHovered && (
                      <div
                        className={`absolute inset-0 w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-xl sm:rounded-2xl ${channel.bgGradient} opacity-20 animate-ping`}
                      />
                    )}
                  </div>

                  {/* Title */}
                  <h3 className={`text-lg sm:text-xl font-bold mb-2 sm:mb-3 transition-colors duration-200 ${
                    isDisabled ? 'text-subtle/70' : 'text-foreground'
                  }`}>
                    {channel.name}
                  </h3>

                  {/* Description */}
                  <p className="text-xs sm:text-sm text-subtle leading-relaxed mb-4 sm:mb-6 min-h-[36px] sm:min-h-[48px]">
                    {channel.description}
                  </p>
                  
                  {/* Button */}
                  {channel.available && (
                    <button
                      className={`
                        w-full py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg sm:rounded-xl text-white font-semibold text-xs sm:text-sm
                        transition-all duration-200 shadow-sm
                        ${channel.buttonBg}
                        transform active:scale-95
                        ${isHovered ? 'shadow-md' : ''}
                      `}
                    >
                      Escolher
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-8 py-4 sm:py-5 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20 border-t border-border">
          <div className="flex items-center justify-center gap-2 text-xs sm:text-sm">
            <span className="text-xl sm:text-2xl animate-pulse">💡</span>
            <p className="text-subtle text-center">
              <strong className="font-semibold text-foreground">Dica:</strong> Combine diferentes canais para melhores resultados!
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}



