import React from 'react';
import { Workflow, Webhook, LayoutGrid, Radio, Zap } from 'lucide-react';
import IntegrationCard from '../../inbox/integrations/IntegrationCard';

export default function InboxAutomations() {
    return (
        <div 
            className="h-full p-6 overflow-y-auto"
            style={{ backgroundColor: 'hsl(var(--background))' }}
        >
            <div className="mb-8">
                <h1 
                    className="text-2xl font-bold mb-2 flex items-center gap-2"
                    style={{ color: 'hsl(var(--foreground))' }}
                >
                    <Workflow className="w-6 h-6 text-orange-500" />
                    Regras e Automação
                </h1>
                <p className="max-w-2xl" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Conecte sua caixa de entrada a ferramentas externas e automatize processos com webhooks.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <IntegrationCard
                    title="Webhooks"
                    description="Eventos webhook fornecem atualizações sobre atividades em tempo real na sua conta Chatwoot para sistemas externos."
                    icon={Webhook}
                    color="text-purple-500"
                    status="connected"
                    onConfigure={() => console.log('Configure Webhooks')}
                />

                <IntegrationCard
                    title="Painel de Aplicativos"
                    description="O Painel de Aplicativos permite que você crie e incorpore aplicativos que exibem informações externas no chat."
                    icon={LayoutGrid}
                    color="text-blue-500"
                    status="disconnected"
                    onConfigure={() => console.log('Configure Apps')}
                />

                <IntegrationCard
                    title="Dyte (Áudio & Vídeo)"
                    description="Integração de áudio e vídeo em sua aplicação para permitir chamadas diretas com clientes."
                    icon={Radio}
                    color="text-blue-600"
                    status="disconnected"
                    onConfigure={() => console.log('Configure Dyte')}
                />

                <IntegrationCard
                    title="N8N Workflow"
                    description="Inicie fluxos complexos no N8N baseados em eventos de chat ou tags aplicadas aos contatos."
                    icon={Zap}
                    color="text-orange-500"
                    status="connected"
                    onConfigure={() => console.log('Configure N8N')}
                />
            </div>
        </div>
    );
}
