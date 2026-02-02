// INBOX: Formulário para criar/editar assistente virtual
import React, { useState, useEffect } from 'react';
import type { AIAssistant, Channel } from '../../../types/inbox';
import { aiAssistantsApi, channelsApi } from '../../../services/api/inbox';

interface AssistantFormProps {
    assistant?: AIAssistant;
    onSuccess: () => void;
    onCancel: () => void;
}

export function AssistantForm({ assistant, onSuccess, onCancel }: AssistantFormProps) {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<Partial<AIAssistant>>({
        name: '',
        mode: 'llm',
        channel_id: null,
        llm_provider: 'gemini',
        llm_model: 'gemini-1.5-flash',
        llm_system_prompt: 'Você é um assistente virtual útil e amigável da empresa LeadFlow.',
        webhook_url: '',
        settings: {
            enabled: true,
            auto_respond: true,
            max_tokens: 500,
            temperature: 0.7
        }
    });

    useEffect(() => {
        loadChannels();
        if (assistant) {
            setFormData(assistant);
        }
    }, [assistant]);

    const loadChannels = async () => {
        try {
            const data = await channelsApi.getAll();
            setChannels(data);
        } catch (error) {
            console.error('Error loading channels:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            if (assistant?.id) {
                await aiAssistantsApi.update(assistant.id, formData);
            } else {
                await aiAssistantsApi.create(formData);
            }
            onSuccess();
        } catch (error) {
            console.error('Error saving assistant:', error);
            alert('Erro ao salvar assistente');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-3xl mx-auto h-full overflow-y-auto">
            <div className="mb-8">
                <h2 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                    {assistant ? 'Editar Assistente' : 'Novo Assistente Virtual'}
                </h2>
                <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Configure as regras e comportamentos do seu agente.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Nome */}
                <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                        Nome do Assistente
                    </label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        required
                        placeholder="Ex: Atendente Nível 1"
                        className="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all placeholder-gray-400"
                        style={{ 
                            backgroundColor: 'hsl(var(--background))',
                            borderColor: 'hsl(var(--border))',
                            color: 'hsl(var(--foreground))'
                        }}
                    />
                </div>

                {/* Modo */}
                <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                        Modo de Operação
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className={`
              flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
              ${formData.mode === 'llm'
                                ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}
            `}>
                            <input
                                type="radio"
                                className="sr-only"
                                checked={formData.mode === 'llm'}
                                onChange={() => setFormData({ ...formData, mode: 'llm' })}
                            />
                            <div className="text-2xl">🧠</div>
                            <div>
                                <div className="font-semibold text-gray-900 dark:text-white">Inteligência Artificial</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Gemini, GPT ou Claude</div>
                            </div>
                        </label>

                        <label className={`
              flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
              ${formData.mode === 'webhook'
                                ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}
            `}>
                            <input
                                type="radio"
                                className="sr-only"
                                checked={formData.mode === 'webhook'}
                                onChange={() => setFormData({ ...formData, mode: 'webhook' })}
                            />
                            <div className="text-2xl">🔗</div>
                            <div>
                                <div className="font-semibold text-gray-900 dark:text-white">Webhook Externo</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">n8n, Typebot, Zapier</div>
                            </div>
                        </label>
                    </div>
                </div>

                {/* Configurações LLM */}
                {formData.mode === 'llm' && (
                    <div 
                        className="p-5 rounded-xl space-y-4 border"
                        style={{ 
                            backgroundColor: 'hsl(var(--muted))',
                            borderColor: 'hsl(var(--border))'
                        }}
                    >
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Provedor de IA
                            </label>
                            <select
                                value={formData.llm_provider}
                                onChange={e => setFormData({ ...formData, llm_provider: e.target.value as any })}
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                            >
                                <option value="gemini">Google Gemini (Recomendado)</option>
                                <option value="openai">OpenAI (GPT-4/3.5)</option>
                                <option value="anthropic">Anthropic (Claude)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                API Key
                            </label>
                            <input
                                type="password"
                                value={formData.llm_api_key || ''}
                                onChange={e => setFormData({ ...formData, llm_api_key: e.target.value })}
                                placeholder="sk-..."
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none placeholder-gray-400"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Sua chave será armazenada de forma segura e criptografada.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                System Prompt (Instruções)
                            </label>
                            <textarea
                                value={formData.llm_system_prompt}
                                onChange={e => setFormData({ ...formData, llm_system_prompt: e.target.value })}
                                rows={6}
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none placeholder-gray-400 resize-y"
                                placeholder="Ex: Você é um assistente da LeadFlow. Seja educado, breve e tente agendar uma reunião..."
                            />
                        </div>
                    </div>
                )}

                {/* Configurações Webhook */}
                {formData.mode === 'webhook' && (
                    <div 
                        className="p-5 rounded-xl border"
                        style={{ 
                            backgroundColor: 'hsl(var(--muted))',
                            borderColor: 'hsl(var(--border))'
                        }}
                    >
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            URL do Webhook
                        </label>
                        <input
                            type="url"
                            value={formData.webhook_url || ''}
                            onChange={e => setFormData({ ...formData, webhook_url: e.target.value })}
                            placeholder="https://sua-instancia.n8n.cloud/webhook/..."
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none placeholder-gray-400"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            O payload será enviado via POST para esta URL contendo os dados da mensagem.
                        </p>
                    </div>
                )}

                {/* Canal */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Canal Vinculado
                    </label>
                    <select
                        value={formData.channel_id || ''}
                        onChange={e => setFormData({ ...formData, channel_id: e.target.value === '' ? null : e.target.value })}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                    >
                        <option value="">Todos os canais</option>
                        {channels.map(channel => (
                            <option key={channel.id} value={channel.id}>
                                {channel.name} ({channel.type})
                            </option>
                        ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Deixe em "Todos os canais" para responder a qualquer mensagem recebida.
                    </p>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-6 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className={`px-6 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 transition-colors shadow-lg
              ${loading ? 'opacity-70 cursor-not-allowed' : 'active:scale-95 transform transition-transform'}`}
                    >
                        {loading ? 'Salvando...' : 'Salvar Assistente'}
                    </button>
                </div>
            </form>
        </div>
    );
}
