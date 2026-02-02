import React from 'react';
import { Bot, MessageSquare, Languages, Brain } from 'lucide-react';
import IntegrationCard from '../../inbox/integrations/IntegrationCard';

export default function InboxAssistants() {
    return (
        <div className="h-full p-6 overflow-y-auto" style={{ backgroundColor: 'hsl(var(--background))' }}>
            <div className="mb-8">
                <h1 className="text-2xl font-bold mb-2 flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
                    <Bot className="w-6 h-6 text-purple-500" />
                    Assistentes Virtuais (IA)
                </h1>
                <p className="max-w-2xl" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Configure assistentes inteligentes para responder seus leads automaticamente usando IA avançada.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <IntegrationCard
                    title="OpenAI (GPT-4)"
                    description="Aproveite o poder dos grandes modelos de linguagem do OpenAI com recursos como sugestões de resposta, resumo e reformulação."
                    icon={Brain}
                    color="text-green-500"
                    status="connected"
                    onConfigure={() => console.log('Configure OpenAI')}
                />

                <IntegrationCard
                    title="Dialogflow"
                    description="Construa chatbots com o Dialogflow e integre-os facilmente na sua caixa de entrada para lidar com consultias iniciais."
                    icon={MessageSquare}
                    color="text-orange-500"
                    status="disconnected"
                    onConfigure={() => console.log('Configure Dialogflow')}
                />

                <IntegrationCard
                    title="Google Tradutor"
                    description="Integre o Google Tradutor para ajudar os agentes a traduzir facilmente as mensagens dos clientes em tempo real."
                    icon={Languages}
                    color="text-blue-500"
                    status="disconnected"
                    onConfigure={() => console.log('Configure Google Translate')}
                />

                <IntegrationCard
                    title="Typebot"
                    description="Integre fluxos de conversação visual do Typebot para qualificar leads antes de passar para um humano."
                    icon={Bot}
                    color="text-blue-600"
                    status="connected"
                    onConfigure={() => console.log('Configure Typebot')}
                />
            </div>
        </div>
    );
}
