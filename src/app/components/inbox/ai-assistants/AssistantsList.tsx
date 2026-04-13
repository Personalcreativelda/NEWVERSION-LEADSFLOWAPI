// INBOX: Lista de assistentes virtuais
import React, { useState, useEffect } from 'react';
import { aiAssistantsApi } from '../../../services/api/inbox';
import type { MarketplaceTemplate } from '../../../services/api/inbox';
import { AssistantForm } from './AssistantForm';
import type { AIAssistant } from '../../../types/inbox';

type Tab = 'meus' | 'marketplace';

const CATEGORY_COLORS: Record<string, string> = {
    'Atendimento': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    'Vendas': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    'Suporte': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

export function AssistantsList() {
    const [tab, setTab] = useState<Tab>('meus');
    const [assistants, setAssistants] = useState<AIAssistant[]>([]);
    const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
    const [loadingAssistants, setLoadingAssistants] = useState(true);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [installingId, setInstallingId] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedAssistant, setSelectedAssistant] = useState<AIAssistant | undefined>(undefined);
    const [preloadedPrompt, setPreloadedPrompt] = useState<Partial<AIAssistant> | undefined>(undefined);

    useEffect(() => {
        loadAssistants();
    }, []);

    useEffect(() => {
        if (tab === 'marketplace' && templates.length === 0) {
            loadTemplates();
        }
    }, [tab]);

    const loadAssistants = async () => {
        try {
            setLoadingAssistants(true);
            const data = await aiAssistantsApi.getAll();
            setAssistants(data);
        } catch (error) {
            console.error('Error loading assistants:', error);
        } finally {
            setLoadingAssistants(false);
        }
    };

    const loadTemplates = async () => {
        try {
            setLoadingTemplates(true);
            const data = await aiAssistantsApi.getMarketplaceTemplates();
            setTemplates(data);
        } catch (error) {
            console.error('Error loading marketplace templates:', error);
        } finally {
            setLoadingTemplates(false);
        }
    };

    const handleInstall = async (template: MarketplaceTemplate) => {
        try {
            setInstallingId(template.id);
            await aiAssistantsApi.installFromMarketplace(template.id);
            await loadAssistants();
            setTab('meus');
        } catch (error) {
            console.error('Error installing template:', error);
            alert('Erro ao instalar assistente');
        } finally {
            setInstallingId(null);
        }
    };

    const handleCustomize = (template: MarketplaceTemplate) => {
        setPreloadedPrompt({
            name: template.name,
            mode: template.mode,
            channel_id: null,
            llm_provider: template.llm_provider,
            llm_model: template.llm_model,
            llm_system_prompt: template.llm_system_prompt,
            settings: { ...template.settings } as any
        });
        setSelectedAssistant(undefined);
        setIsEditing(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja remover este assistente?')) return;
        try {
            await aiAssistantsApi.delete(id);
            setAssistants(prev => prev.filter(a => a.id !== id));
        } catch (error) {
            console.error('Error deleting assistant:', error);
        }
    };

    const handleToggle = async (assistant: AIAssistant) => {
        try {
            const newState = !assistant.is_active;
            await aiAssistantsApi.toggle(assistant.id, newState);
            setAssistants(prev => prev.map(a =>
                a.id === assistant.id ? { ...a, is_active: newState } : a
            ));
        } catch (error) {
            console.error('Error toggling assistant:', error);
        }
    };

    if (isEditing) {
        return (
            <AssistantForm
                assistant={selectedAssistant ?? (preloadedPrompt as AIAssistant | undefined)}
                onSuccess={() => {
                    setIsEditing(false);
                    setPreloadedPrompt(undefined);
                    loadAssistants();
                }}
                onCancel={() => {
                    setIsEditing(false);
                    setPreloadedPrompt(undefined);
                }}
            />
        );
    }

    return (
        <div className="p-6 h-full overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                        Assistentes Virtuais
                    </h2>
                    <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Automatize o atendimento com IA.
                    </p>
                </div>
                {tab === 'meus' && (
                    <button
                        onClick={() => {
                            setSelectedAssistant(undefined);
                            setPreloadedPrompt(undefined);
                            setIsEditing(true);
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Novo Assistente
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ backgroundColor: 'hsl(var(--muted))' }}>
                <button
                    onClick={() => setTab('meus')}
                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'meus' ? 'bg-white dark:bg-gray-800 shadow-sm text-purple-700 dark:text-purple-300' : ''}`}
                    style={tab !== 'meus' ? { color: 'hsl(var(--muted-foreground))' } : undefined}
                >
                    Meus Assistentes
                    {assistants.length > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                            {assistants.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setTab('marketplace')}
                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${tab === 'marketplace' ? 'bg-white dark:bg-gray-800 shadow-sm text-purple-700 dark:text-purple-300' : ''}`}
                    style={tab !== 'marketplace' ? { color: 'hsl(var(--muted-foreground))' } : undefined}
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Marketplace
                </button>
            </div>

            {/* ── Meus Assistentes ── */}
            {tab === 'meus' && (
                <>
                    {loadingAssistants ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {assistants.map(assistant => (
                                <div
                                    key={assistant.id}
                                    className="border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group"
                                    style={{
                                        backgroundColor: 'hsl(var(--card))',
                                        borderColor: 'hsl(var(--border))'
                                    }}
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-xl text-purple-600 dark:text-purple-400">
                                            {assistant.mode === 'llm' ? '🧠' : '🔗'}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                                    {assistant.name}
                                                </h4>
                                                <span
                                                    className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                                                    style={{
                                                        backgroundColor: 'hsl(var(--muted))',
                                                        color: 'hsl(var(--muted-foreground))'
                                                    }}
                                                >
                                                    {assistant.mode}
                                                </span>
                                            </div>
                                            <p className="text-sm mt-1 truncate max-w-md" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                                {assistant.mode === 'llm'
                                                    ? `${assistant.llm_provider} • ${assistant.llm_model}`
                                                    : assistant.webhook_url}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <div className="relative">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only"
                                                    checked={assistant.is_active}
                                                    onChange={() => handleToggle(assistant)}
                                                />
                                                <div className={`block w-10 h-6 rounded-full transition-colors ${assistant.is_active ? 'bg-purple-600' : ''}`} style={!assistant.is_active ? { backgroundColor: 'hsl(var(--muted))' } : undefined}></div>
                                                <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${assistant.is_active ? 'transform translate-x-4' : ''}`}></div>
                                            </div>
                                            <span className="text-sm font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                                {assistant.is_active ? 'Ativo' : 'Pausado'}
                                            </span>
                                        </label>

                                        <div className="h-8 w-px mx-2" style={{ backgroundColor: 'hsl(var(--border))' }}></div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    setSelectedAssistant(assistant);
                                                    setPreloadedPrompt(undefined);
                                                    setIsEditing(true);
                                                }}
                                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                                title="Editar"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </button>

                                            <button
                                                onClick={() => handleDelete(assistant.id)}
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                title="Excluir"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {assistants.length === 0 && (
                                <div
                                    className="flex flex-col items-center justify-center p-12 rounded-2xl border-2 border-dashed text-center"
                                    style={{
                                        backgroundColor: 'hsl(var(--muted))',
                                        borderColor: 'hsl(var(--border))'
                                    }}
                                >
                                    <div
                                        className="w-16 h-16 rounded-full flex items-center justify-center mb-4 text-3xl"
                                        style={{ backgroundColor: 'hsl(var(--background))' }}
                                    >
                                        🤖
                                    </div>
                                    <h3 className="text-lg font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                        Nenhum assistente criado
                                    </h3>
                                    <p className="max-w-sm mb-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        Use um template pré-configurado do Marketplace ou crie do zero.
                                    </p>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setTab('marketplace')}
                                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
                                        >
                                            Ver Marketplace
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSelectedAssistant(undefined);
                                                setPreloadedPrompt(undefined);
                                                setIsEditing(true);
                                            }}
                                            className="px-4 py-2 rounded-lg font-medium transition-colors border"
                                            style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }}
                                        >
                                            Criar do Zero
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ── Marketplace ── */}
            {tab === 'marketplace' && (
                <div>
                    <p className="text-sm mb-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Assistentes pré-configurados prontos para usar. Instale com um clique e personalize o prompt conforme a sua empresa.
                    </p>

                    {loadingTemplates ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                            {templates.map(template => (
                                <div
                                    key={template.id}
                                    className="rounded-2xl border p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
                                    style={{
                                        backgroundColor: 'hsl(var(--card))',
                                        borderColor: 'hsl(var(--border))'
                                    }}
                                >
                                    {/* Card header */}
                                    <div className="flex items-start gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-2xl flex-shrink-0">
                                            {template.icon}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h4 className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                                    {template.name}
                                                </h4>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${CATEGORY_COLORS[template.category] ?? 'bg-gray-100 text-gray-600'}`}>
                                                    {template.category}
                                                </span>
                                            </div>
                                            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                                {template.llm_provider} • {template.llm_model}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Description */}
                                    <p className="text-sm leading-relaxed flex-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        {template.description}
                                    </p>

                                    {/* System prompt preview */}
                                    {template.llm_system_prompt && (
                                        <div
                                            className="rounded-lg p-3 text-xs font-mono line-clamp-3 leading-relaxed"
                                            style={{
                                                backgroundColor: 'hsl(var(--muted))',
                                                color: 'hsl(var(--muted-foreground))'
                                            }}
                                        >
                                            {template.llm_system_prompt.slice(0, 180)}…
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex gap-2 pt-1">
                                        <button
                                            onClick={() => handleInstall(template)}
                                            disabled={installingId === template.id}
                                            className="flex-1 py-2 px-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                        >
                                            {installingId === template.id ? (
                                                <>
                                                    <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                                    A instalar…
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                    </svg>
                                                    Instalar
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => handleCustomize(template)}
                                            className="py-2 px-3 rounded-lg text-sm font-medium transition-colors border"
                                            style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }}
                                            title="Personalizar antes de instalar"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


export function AssistantsList() {
    const [assistants, setAssistants] = useState<AIAssistant[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedAssistant, setSelectedAssistant] = useState<AIAssistant | undefined>(undefined);

    useEffect(() => {
        loadAssistants();
    }, []);

    const loadAssistants = async () => {
        try {
            setLoading(true);
            const data = await aiAssistantsApi.getAll();
            setAssistants(data);
        } catch (error) {
            console.error('Error loading assistants:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja remover este assistente?')) return;
        try {
            await aiAssistantsApi.delete(id);
            setAssistants(prev => prev.filter(a => a.id !== id));
        } catch (error) {
            console.error('Error deleting assistant:', error);
        }
    };

    const handleToggle = async (assistant: AIAssistant) => {
        try {
            const newState = !assistant.is_active;
            await aiAssistantsApi.toggle(assistant.id, newState);
            setAssistants(prev => prev.map(a =>
                a.id === assistant.id ? { ...a, is_active: newState } : a
            ));
        } catch (error) {
            console.error('Error toggling assistant:', error);
        }
    };

    if (isEditing) {
        return (
            <AssistantForm
                assistant={selectedAssistant}
                onSuccess={() => {
                    setIsEditing(false);
                    loadAssistants();
                }}
                onCancel={() => setIsEditing(false)}
            />
        );
    }

    return (
        <div className="p-6 h-full overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        Assistentes Virtuais
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Automatize seu atendimento com IA ou Webhooks.
                    </p>
                </div>
                <button
                    onClick={() => {
                        setSelectedAssistant(undefined);
                        setIsEditing(true);
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Novo Assistente
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                </div>
            ) : (
                <div className="space-y-4">
                    {assistants.map(assistant => (
                        <div
                            key={assistant.id}
                            className="border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group"
                            style={{ 
                                backgroundColor: 'hsl(var(--card))',
                                borderColor: 'hsl(var(--border))'
                            }}
                        >
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-xl text-purple-600 dark:text-purple-400">
                                    {assistant.mode === 'llm' ? '🧠' : '🔗'}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                            {assistant.name}
                                        </h4>
                                        <span 
                                            className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                                            style={{ 
                                                backgroundColor: 'hsl(var(--muted))',
                                                color: 'hsl(var(--muted-foreground))'
                                            }}
                                        >
                                            {assistant.mode}
                                        </span>
                                    </div>
                                    <p className="text-sm mt-1 truncate max-w-md" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        {assistant.mode === 'llm'
                                            ? `${assistant.llm_provider} • ${assistant.llm_model}`
                                            : assistant.webhook_url}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={assistant.is_active}
                                            onChange={() => handleToggle(assistant)}
                                        />
                                        <div className={`block w-10 h-6 rounded-full transition-colors ${assistant.is_active ? 'bg-purple-600' : ''}`} style={!assistant.is_active ? { backgroundColor: 'hsl(var(--muted))' } : undefined}></div>
                                        <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${assistant.is_active ? 'transform translate-x-4' : ''}`}></div>
                                    </div>
                                    <span className="text-sm font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        {assistant.is_active ? 'Ativo' : 'Pausado'}
                                    </span>
                                </label>

                                <div className="h-8 w-px mx-2" style={{ backgroundColor: 'hsl(var(--border))' }}></div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            setSelectedAssistant(assistant);
                                            setIsEditing(true);
                                        }}
                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                        title="Editar"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                    </button>

                                    <button
                                        onClick={() => handleDelete(assistant.id)}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                        title="Excluir"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {assistants.length === 0 && (
                        <div 
                            className="flex flex-col items-center justify-center p-12 rounded-2xl border-2 border-dashed text-center"
                            style={{ 
                                backgroundColor: 'hsl(var(--muted))',
                                borderColor: 'hsl(var(--border))'
                            }}
                        >
                            <div 
                                className="w-16 h-16 rounded-full flex items-center justify-center mb-4 text-3xl"
                                style={{ backgroundColor: 'hsl(var(--background))' }}
                            >
                                🤖
                            </div>
                            <h3 className="text-lg font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                Nenhum assistente criado
                            </h3>
                            <p className="max-w-sm mb-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Crie um assistente para responder seus clientes automaticamente 24h por dia.
                            </p>
                            <button
                                onClick={() => {
                                    setSelectedAssistant(undefined);
                                    setIsEditing(true);
                                }}
                                className="text-purple-600 font-medium hover:underline"
                            >
                                Criar Primeiro Assistente
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
