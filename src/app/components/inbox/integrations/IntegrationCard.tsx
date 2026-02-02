import React from 'react';
import { Check, ArrowRight, Settings } from 'lucide-react';

interface IntegrationCardProps {
    title: string;
    description: string;
    icon: any;
    status?: 'connected' | 'disconnected';
    onConfigure?: () => void;
    color?: string;
}

export default function IntegrationCard({
    title,
    description,
    icon: Icon,
    status = 'disconnected',
    onConfigure,
    color = 'text-gray-700 dark:text-gray-300'
}: IntegrationCardProps) {
    return (
        <div 
            className="rounded-xl p-6 border flex flex-col justify-between hover:border-[#00D9A3]/50 transition-all duration-300 group"
            style={{ 
                backgroundColor: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))'
            }}
        >
            <div>
                <div className="flex justify-between items-start mb-4">
                    <div 
                        className="p-3 rounded-xl group-hover:bg-[#00D9A3]/10 transition-colors"
                        style={{ backgroundColor: 'hsl(var(--muted))' }}
                    >
                        <Icon className={`w-8 h-8 ${color}`} />
                    </div>
                    {status === 'connected' && (
                        <div className="bg-green-500/10 text-green-500 p-1.5 rounded-full">
                            <Check className="w-4 h-4" />
                        </div>
                    )}
                </div>
                <h3 
                    className="text-lg font-bold mb-2 group-hover:text-[#00D9A3] transition-colors"
                    style={{ color: 'hsl(var(--foreground))' }}
                >
                    {title}
                </h3>
                <p 
                    className="text-sm mb-6 leading-relaxed line-clamp-3"
                    style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                    {description}
                </p>
            </div>

            <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                <span 
                    className={`text-xs font-semibold px-2 py-1 rounded-md ${status === 'connected'
                        ? 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400'
                        : ''
                    }`}
                    style={status !== 'connected' ? { 
                        backgroundColor: 'hsl(var(--muted))',
                        color: 'hsl(var(--muted-foreground))'
                    } : undefined}
                >
                    {status === 'connected' ? 'Ativo' : 'Configurar'}
                </span>

                <button
                    onClick={onConfigure}
                    className="hover:text-[#00D9A3] transition-colors"
                    style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                    <Settings className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
