import React, { useState, useEffect } from 'react';
import { conversationTagsApi } from '../../../services/api/inbox';
import { Plus, Trash2, Edit2, GripVertical, Loader } from 'lucide-react';
import TagCreateModal from './TagCreateModal';
import TagEditModal from './TagEditModal';

interface Tag {
    id: string;
    name: string;
    color?: string;
    icon?: string;
    order_index?: number;
    description?: string;
    conversation_count?: number;
}

export default function TagsList() {
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const [draggedTag, setDraggedTag] = useState<Tag | null>(null);

    useEffect(() => {
        loadTags();
    }, []);

    const loadTags = async () => {
        setLoading(true);
        try {
            const data = await conversationTagsApi.getAllTags();
            // Ordenar por order_index
            const sorted = (data || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
            setTags(sorted);
        } catch (err) {
            console.error('Erro ao carregar etiquetas:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateTag = async (tagData: { name: string; color?: string; icon?: string; description?: string }) => {
        try {
            await conversationTagsApi.createTag(tagData);
            setShowCreateModal(false);
            await loadTags();
        } catch (err) {
            console.error('Erro ao criar etiqueta:', err);
            alert('Erro ao criar etiqueta. Tente novamente.');
        }
    };

    const handleEditTag = async (tagData: Partial<Tag>) => {
        if (!editingTag) return;
        try {
            await conversationTagsApi.updateTag(editingTag.id, tagData);
            setShowEditModal(false);
            setEditingTag(null);
            await loadTags();
        } catch (err) {
            console.error('Erro ao atualizar etiqueta:', err);
            alert('Erro ao atualizar etiqueta. Tente novamente.');
        }
    };

    const handleDeleteTag = async (tagId: string) => {
        if (!window.confirm('Tem certeza que deseja deletar esta etiqueta? As conversas não serão afetadas.')) {
            return;
        }
        try {
            await conversationTagsApi.deleteTag(tagId);
            await loadTags();
        } catch (err) {
            console.error('Erro ao deletar etiqueta:', err);
            alert('Erro ao deletar etiqueta. Tente novamente.');
        }
    };

    const handleDragStart = (tag: Tag) => {
        setDraggedTag(tag);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = async (targetTag: Tag) => {
        if (!draggedTag || draggedTag.id === targetTag.id) {
            setDraggedTag(null);
            return;
        }

        // Reordenar tags localmente
        const draggedIndex = tags.findIndex(t => t.id === draggedTag.id);
        const targetIndex = tags.findIndex(t => t.id === targetTag.id);

        const newTags = [...tags];
        const [movedTag] = newTags.splice(draggedIndex, 1);
        newTags.splice(targetIndex, 0, movedTag);

        // Atualizar order_index
        const reorderedTags = newTags.map((tag, index) => ({
            ...tag,
            order_index: index
        }));

        setTags(reorderedTags);
        setDraggedTag(null);

        // Enviar para API
        try {
            await conversationTagsApi.reorderTags(reorderedTags.map(t => t.id));
        } catch (err) {
            console.error('Erro ao reordenar etiquetas:', err);
            // Recarregar para desfazer mudança
            await loadTags();
            alert('Erro ao reordenar etiquetas. Tente novamente.');
        }
    };

    const getTagColor = (color?: string): string => {
        if (!color) return 'bg-gray-500';
        
        // Se for hex color
        if (color.startsWith('#')) {
            return color;
        }
        
        // Se for classe Tailwind
        if (color.startsWith('bg-')) {
            return color;
        }
        
        return 'bg-gray-500';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader className="w-8 h-8 animate-spin" style={{ color: 'hsl(var(--muted-foreground))' }} />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header com botão Nova Etiqueta */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                        Etiquetas Disponíveis
                    </h2>
                    <p style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {tags.length} etiqueta{tags.length !== 1 ? 's' : ''} criada{tags.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors"
                    style={{
                        backgroundColor: 'hsl(var(--primary))',
                        color: 'hsl(var(--primary-foreground))'
                    }}
                >
                    <Plus className="w-4 h-4" />
                    Nova Etiqueta
                </button>
            </div>

            {/* Lista de etiquetas */}
            {tags.length === 0 ? (
                <div
                    className="text-center py-12 rounded-lg border-2 border-dashed"
                    style={{
                        borderColor: 'hsl(var(--border))',
                        color: 'hsl(var(--muted-foreground))'
                    }}
                >
                    <p className="mb-4">Nenhuma etiqueta criada ainda</p>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="text-blue-500 hover:text-blue-600 font-medium"
                    >
                        Criar primeira etiqueta
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    {tags.map((tag) => (
                        <div
                            key={tag.id}
                            draggable
                            onDragStart={() => handleDragStart(tag)}
                            onDragOver={handleDragOver}
                            onDrop={() => handleDrop(tag)}
                            className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                                draggedTag?.id === tag.id
                                    ? 'opacity-50 border-blue-500 bg-blue-50/20 dark:bg-blue-900/10'
                                    : 'border-border hover:border-blue-500 cursor-move'
                            }`}
                            style={{
                                borderColor: draggedTag?.id === tag.id ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                            }}
                        >
                            {/* Drag handle */}
                            <GripVertical className="w-5 h-5 flex-shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }} />

                            {/* Cor da etiqueta */}
                            <div className="flex-shrink-0">
                                <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                                    style={{
                                        backgroundColor: getTagColor(tag.color),
                                        opacity: getTagColor(tag.color).startsWith('bg-') ? 1 : 0.9
                                    }}
                                >
                                    {tag.icon || tag.name.charAt(0).toUpperCase()}
                                </div>
                            </div>

                            {/* Info da etiqueta */}
                            <div className="flex-1 min-w-0">
                                <h3 className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                                    {tag.name}
                                </h3>
                                {tag.description && (
                                    <p
                                        className="text-sm truncate"
                                        style={{ color: 'hsl(var(--muted-foreground))' }}
                                    >
                                        {tag.description}
                                    </p>
                                )}
                            </div>

                            {/* Contador de conversas */}
                            {tag.conversation_count ? (
                                <div
                                    className="px-3 py-1 rounded-full text-sm font-medium"
                                    style={{
                                        backgroundColor: 'hsl(var(--muted))',
                                        color: 'hsl(var(--muted-foreground))'
                                    }}
                                >
                                    {tag.conversation_count} conversa{tag.conversation_count !== 1 ? 's' : ''}
                                </div>
                            ) : null}

                            {/* Ações */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                    onClick={() => {
                                        setEditingTag(tag);
                                        setShowEditModal(true);
                                    }}
                                    className="p-2 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                    title="Editar etiqueta"
                                >
                                    <Edit2 className="w-4 h-4 text-blue-500" />
                                </button>
                                <button
                                    onClick={() => handleDeleteTag(tag.id)}
                                    className="p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    title="Deletar etiqueta"
                                >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modals */}
            {showCreateModal && (
                <TagCreateModal
                    onClose={() => setShowCreateModal(false)}
                    onCreate={handleCreateTag}
                />
            )}

            {showEditModal && editingTag && (
                <TagEditModal
                    tag={editingTag}
                    onClose={() => {
                        setShowEditModal(false);
                        setEditingTag(null);
                    }}
                    onUpdate={handleEditTag}
                />
            )}
        </div>
    );
}
