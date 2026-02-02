import { useState } from 'react';
import { Upload, User, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { toast } from "sonner";
import { getApiBaseUrl } from '../../utils/api-client';

interface AccountSettingsPageProps {
  user: any;
  onUpdateUser: (updates: any) => void;
}

type TabType = 'avatar' | 'name';

export default function AccountSettingsPage({ user, onUpdateUser }: AccountSettingsPageProps) {
  const [activeTab, setActiveTab] = useState<TabType>('avatar');
  const [loading, setLoading] = useState(false);
  
  // Avatar state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  
  // Name state
  const [name, setName] = useState(user?.name || '');

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveAvatar = async () => {
    if (!avatarFile) {
      toast.error('Selecione uma imagem');
      return;
    }

    setLoading(true);
    try {
      console.log('[AccountSettings] 📤 Starting avatar upload...');
      console.log('[AccountSettings] File info:', {
        name: avatarFile.name,
        type: avatarFile.type,
        size: avatarFile.size,
        sizeInMB: (avatarFile.size / 1024 / 1024).toFixed(2) + 'MB'
      });

      // Upload avatar to backend
      const formData = new FormData();
      formData.append('avatar', avatarFile);

      const token = localStorage.getItem('leadflow_access_token');
      console.log('[AccountSettings] Token available:', !!token);

      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(
        `${apiBaseUrl}/api/users/avatar`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        }
      );

      console.log('[AccountSettings] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[AccountSettings] Server error:', errorData);
        throw new Error(errorData.error || errorData.details || 'Erro ao fazer upload');
      }

      const data = await response.json();
      console.log('[AccountSettings] ✅ Avatar uploaded successfully');
      console.log('[AccountSettings] Response data:', {
        hasAvatarUrl: !!data.avatar_url,
        urlLength: data.avatar_url?.length,
        avatarUrlPreview: data.avatar_url?.substring(0, 100)
      });

      // Extract user object from response (it's nested in data.user)
      const updatedUser = data.user || data;
      console.log('[AccountSettings] Updated user avatar URL:', updatedUser.avatar_url?.substring(0, 100));

      // Update user state with new avatar
      onUpdateUser({ ...user, ...updatedUser });

      toast.success('Avatar atualizado com sucesso!');
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (error: any) {
      console.error('[AccountSettings] ❌ Error uploading avatar:', error);
      console.error('[AccountSettings] Error details:', {
        message: error.message,
        stack: error.stack
      });
      toast.error(error.message || 'Erro ao atualizar avatar');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveName = async () => {
    if (!name.trim()) {
      toast.error('Nome não pode estar vazio');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('leadflow_access_token');
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(
        `${apiBaseUrl}/api/users/profile`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ name }),
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao atualizar nome');
      }

      const updatedProfile = await response.json();
      onUpdateUser(updatedProfile);
      toast.success('Nome atualizado com sucesso!');
    } catch (error) {
      console.error('[AccountSettings] Error updating name:', error);
      toast.error('Erro ao atualizar nome');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'avatar' as TabType, label: 'Avatar', icon: Upload },
    { id: 'name' as TabType, label: 'Nome', icon: User },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-0">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground dark:text-foreground mb-2">
          Configurações da Conta
        </h1>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground">
          Gerencie suas informações pessoais e segurança
        </p>
      </div>

      {/* Tabs - Estilo minimalista do pricing */}
      <div className="border-b border-border dark:border-border mb-6">
        <div className="flex gap-6 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-1 py-3 border-b-2 transition-colors whitespace-nowrap text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-card dark:bg-card rounded-xl border border-border dark:border-border p-6">
        {activeTab === 'avatar' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground dark:text-foreground mb-4">
                Alterar Avatar
              </h3>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground mb-6">
                Atualize sua foto de perfil
              </p>
            </div>

            <div className="flex items-start gap-6">
              {/* Add key to force re-render when avatar URL changes */}
              <Avatar key={user?.avatar_url || 'no-avatar'} className="h-24 w-24">
                <AvatarImage
                  src={avatarPreview || user?.avatar_url}
                  alt={user?.name || 'User'}
                  onError={(e) => {
                    console.error('[AccountSettings] Avatar image failed to load:', user?.avatar_url);
                  }}
                />
                <AvatarFallback className="text-2xl bg-blue-600 text-white">
                  {user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <input
                  type="file"
                  id="avatar-upload"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
                <label
                  htmlFor="avatar-upload"
                  className="inline-flex items-center px-4 py-2 border border-border dark:border-border rounded-lg text-sm font-medium text-foreground dark:text-foreground bg-card dark:bg-card hover:bg-muted dark:hover:bg-muted cursor-pointer transition-colors"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Escolher Arquivo
                </label>
                <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-2">
                  JPG, PNG ou GIF. Máximo 2MB.
                </p>
              </div>
            </div>

            {avatarFile && (
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveAvatar}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar Avatar'
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'name' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground dark:text-foreground mb-4">
                Alterar Nome
              </h3>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground mb-6">
                Atualize seu nome de exibição
              </p>
            </div>

            <div className="max-w-md space-y-4">
              <div>
                <Label htmlFor="name" className="text-sm">Nome Completo</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="mt-1.5"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveName}
                  disabled={loading || name === user?.name}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar Nome'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

