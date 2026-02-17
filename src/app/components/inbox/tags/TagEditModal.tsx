import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface Tag {
    id: string;
    name: string;
    color?: string;
    icon?: string;
    description?: string;
    conversation_count?: number;
}

interface TagEditModalProps {
    tag: Tag;
    onClose: () => void;
    onUpdate: (tagData: Partial<Tag>) => void;
}

const DEFAULT_COLORS = [
    '#FF6B6B',
    '#FFA94D',
    '#FFD43B',
    '#51CF66',
    '#37B7C1',
    '#339AF0',
    '#845EF7',
    '#F06595',
];

const DEFAULT_ICONS = ['🔥', '⭐', '✨', '🎯', '📌', '💼', '🚀', '❗', '✅', '⏰', '💬', '📧'];

export default function TagEditModal({ tag, onClose, onUpdate }: TagEditModalProps) {
    const [name, setName] = useState(tag.name);
    const [color, setColor] = useState(tag.color || '#339AF0');
    const [icon, setIcon] = useState(tag.icon || '');
    const [description, setDescription] = useState(tag.description || '');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        setName(tag.name);
        setColor(tag.color || '#339AF0');
        setIcon(tag.icon || '');
        setDescription(tag.description || '');
    }, [tag]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!name.trim()) {
            alert('Nome da etiqueta é obrigatório');
            return;
        }

        setIsSubmitting(true);
        try {
            await onUpdate({
                name: name.trim(),
                color,
                icon,
                description: description.trim() || undefined
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div
                className="w-full max-w-md rounded-lg shadow-lg p-6 space-y-4"
                style={{ backgroundColor: 'hsl(var(--background))' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                        Editar Etiqueta
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Nome */}
                    <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                            Nome da Etiqueta*
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: Urgente, VIP, etc"
                            className="w-full px-3 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                            style={{
                                borderColor: 'hsl(var(--border))',
                                backgroundColor: 'hsl(var(--input))',
                                color: 'hsl(var(--foreground))'
                            }}
                            disabled={isSubmitting}
                        />
                    </div>

                    {/* Descrição */}
                    <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                            Descrição (Opcional)
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Descrição da etiqueta..."
                            rows={2}
                            className="w-full px-3 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors resize-none"
                            style={{
                                borderColor: 'hsl(var(--border))',
                                backgroundColor: 'hsl(var(--input))',
                                color: 'hsl(var(--foreground))'
                            }}
                            disabled={isSubmitting}
                        />
                    </div>

                    {/* Cor */}
                    <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                            Cor
                        </label>
                        <div className="grid grid-cols-8 gap-2">
                            {DEFAULT_COLORS.map((colorOption) => (
                                <button
                                    key={colorOption}
                                    type="button"
                                    onClick={() => setColor(colorOption)}
                                    className={`w-8 h-8 rounded-lg transition-all ${
                                        color === colorOption ? 'ring-2 ring-offset-2' : ''
                                    }`}
                                    style={{
                                        backgroundColor: colorOption,
                                        ringColor: color === colorOption ? colorOption : undefined,
                                    }}
                                    disabled={isSubmitting}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Ícone */}
                    <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                            Ícone (Opcional)
                        </label>
                        <div className="grid grid-cols-6 gap-2">
                            <button
                                key="clear"
                                type="button"
                                onClick={() => setIcon('')}
                                className={`p-2 rounded-lg border transition-all text-center text-sm ${
                                    icon === '' ? 'ring-2 ring-blue-500' : ''
                                }`}
                                style={{
                                    borderColor: icon === '' ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                                    backgroundColor: icon === '' ? 'hsl(var(--primary) / 0.1)' : 'transparent'
                                }}
                                disabled={isSubmitting}
                            >
                                Nenhum
                            </button>
                            {DEFAULT_ICONS.map((iconOption) => (
                                <button
                                    key={iconOption}
                                    type="button"
                                    onClick={() => setIcon(iconOption)}
                                    className={`p-2 rounded-lg border transition-all text-xl ${
                                        icon === iconOption ? 'ring-2 ring-blue-500' : ''
                                    }`}
                                    style={{
                                        borderColor: icon === iconOption ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                                        backgroundColor: icon === iconOption ? 'hsl(var(--primary) / 0.1)' : 'transparent'
                                    }}
                                    disabled={isSubmitting}
                                >
                                    {iconOption}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="p-3 rounded-lg" style={{ backgroundColor: 'hsl(var(--muted))' }}>
                        <p className="text-xs mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            Preview
                        </p>
                        <div className="flex items-center gap-2">
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                                style={{ backgroundColor: color }}
                            >
                                {icon || name.charAt(0).toUpperCase() || '?'}
                            </div>
                            <div>
                                <p style={{ color: 'hsl(var(--foreground))' }}>
                                    {name || 'Nome da Etiqueta'}
                                </p>
                                {description && (
                                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        {description}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Info de uso */}
                    {tag.conversation_count ? (
                        <div
                            className="p-2 rounded-lg text-sm"
                            style={{
                                backgroundColor: 'hsl(var(--muted))',
                                color: 'hsl(var(--muted-foreground))'
                            }}
                        >
                            Esta etiqueta está sendo usada em {tag.conversation_count} conversa
                            {tag.conversation_count !== 1 ? 's' : ''}.
                        </div>
                    ) : null}

                    {/* Botões */}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 rounded-md border transition-colors"
                            style={{
                                borderColor: 'hsl(var(--border))',
                                color: 'hsl(var(--foreground))'
                            }}
                            disabled={isSubmitting}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 rounded-md font-medium transition-colors"
                            style={{
                                backgroundColor: 'hsl(var(--primary))',
                                color: 'hsl(var(--primary-foreground))'
                            }}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Atualizando...' : 'Atualizar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
