import { useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { leadsApi } from '../../utils/api';

interface AvatarUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    leadId: string;
    currentAvatarUrl?: string;
    onAvatarUpdated: (newUrl: string) => void;
    isDark?: boolean;
}

export default function AvatarUploadModal({
    isOpen,
    onClose,
    leadId,
    currentAvatarUrl,
    onAvatarUpdated,
    isDark = false,
}: AvatarUploadModalProps) {
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState<string | null>(currentAvatarUrl || null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validar tipo de arquivo
        if (!file.type.startsWith('image/')) {
            toast.error('Por favor, selecione apenas imagens.');
            return;
        }

        // Validar tamanho (5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Imagem muito grande. Máximo 5MB.');
            return;
        }

        // Preview local
        const reader = new FileReader();
        reader.onloadend = () => {
            setPreview(reader.result as string);
        };
        reader.readAsDataURL(file);

        // Upload para o servidor
        setUploading(true);
        try {
            const result = await leadsApi.uploadAvatar(leadId, file);
            if (result.success) {
                onAvatarUpdated(result.avatarUrl);
                toast.success('Avatar atualizado com sucesso!');
                setTimeout(() => {
                    onClose();
                }, 500);
            } else {
                throw new Error(result.error || 'Erro ao fazer upload');
            }
        } catch (error: any) {
            console.error('[AvatarUploadModal] Error uploading avatar:', error);
            toast.error(error.message || 'Erro ao fazer upload do avatar');
            setPreview(currentAvatarUrl || null);
        } finally {
            setUploading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal */}
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                <div
                    className="w-full max-w-sm rounded-2xl shadow-2xl p-6 bg-card text-foreground"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Upload de Avatar</h3>
                        <button
                            onClick={onClose}
                            disabled={uploading}
                            className={`p-2 rounded-lg transition-colors ${uploading
                                    ? 'opacity-50 cursor-not-allowed'
                                    : isDark
                                        ? 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'
                                        : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
                                }`}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Preview */}
                    <div className="flex justify-center mb-6">
                        {preview ? (
                            <div className="relative">
                                <img
                                    src={preview}
                                    alt="Preview"
                                    className="w-32 h-32 rounded-full object-cover border-4 border-gray-200 dark:border-gray-700"
                                />
                                {uploading && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div
                                className={`w-32 h-32 rounded-full flex items-center justify-center border-4 ${isDark
                                        ? 'bg-gray-800 border-gray-700'
                                        : 'bg-gray-100 border-gray-200'
                                    }`}
                            >
                                <Upload className="w-12 h-12 text-gray-400" />
                            </div>
                        )}
                    </div>

                    {/* Upload Button */}
                    <label className="block">
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            disabled={uploading}
                            className="hidden"
                        />
                        <div
                            className={`w-full py-3 px-4 rounded-lg border-2 border-dashed text-center cursor-pointer transition-colors ${uploading
                                    ? 'opacity-50 cursor-not-allowed'
                                    : isDark
                                        ? 'border-gray-700 hover:border-blue-500 hover:bg-blue-900/20'
                                        : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                                }`}
                        >
                            {uploading ? (
                                <div className="flex items-center justify-center gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span>Enviando...</span>
                                </div>
                            ) : (
                                <>
                                    <Upload className="w-6 h-6 mx-auto mb-2" />
                                    <span className="text-sm font-medium">
                                        Clique para selecionar imagem
                                    </span>
                                    <span
                                        className={`block text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'
                                            }`}
                                    >
                                        JPG, PNG ou WEBP • Máximo 5MB
                                    </span>
                                </>
                            )}
                        </div>
                    </label>
                </div>
            </div>
        </>
    );
}
