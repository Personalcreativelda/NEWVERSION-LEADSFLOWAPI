import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { toast } from 'sonner';
import { Upload, User } from 'lucide-react';
import { Button } from '../ui/button';

interface AvatarUploadProps {
  currentAvatar?: string;
  userName: string;
  onAvatarUpdate: (file: File) => Promise<void>;
}

export function AvatarUpload({ currentAvatar, userName, onAvatarUpdate }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentAvatar || null);

  // Update preview when currentAvatar changes (e.g., after login)
  useEffect(() => {
    console.log('[AvatarUpload] currentAvatar changed:', currentAvatar ? 'exists' : 'null');
    setPreview(currentAvatar || null);
  }, [currentAvatar]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem válida');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem deve ter menos de 2MB');
      return;
    }

    try {
      setUploading(true);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      console.log('[AvatarUpload] 📤 Sending avatar to backend...');
      await onAvatarUpdate(file);
      console.log('[AvatarUpload] ✅ Avatar saved successfully');
    } catch (error) {
      console.error('[AvatarUpload] ❌ Error:', error);
      const message = error instanceof Error ? error.message : 'Erro ao enviar foto de perfil';
      toast.error(message || 'Erro ao enviar foto de perfil');
      setPreview(currentAvatar || null);
    } finally {
      setUploading(false);
    }
  };

  const getInitials = () => {
    return userName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex items-center gap-6">
      <Avatar className="h-24 w-24">
        <AvatarImage src={preview || undefined} alt={userName} />
        <AvatarFallback className="text-2xl">
          {getInitials() || <User className="h-12 w-12" />}
        </AvatarFallback>
      </Avatar>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => document.getElementById('avatar-upload')?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? 'Enviando...' : 'Alterar Foto'}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          JPG, PNG ou GIF. Máximo 2MB.
        </p>
        <input
          id="avatar-upload"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
}

