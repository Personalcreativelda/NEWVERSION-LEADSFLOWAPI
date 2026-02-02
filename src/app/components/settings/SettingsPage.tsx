import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { ArrowLeft, User, CreditCard, Webhook, Shield, Save, CheckCircle, Zap, Lock } from 'lucide-react';
import { userApi, authApi } from '../../utils/api';
import { AvatarUpload } from './AvatarUpload';
import IntegrationSettings from './IntegrationSettings';
import SMTPSettings from './SMTPSettings';
import { WhatsAppConnection } from '../WhatsAppConnection';
import { toast } from "sonner";

interface SettingsPageProps {
  user: any;
  onBack: () => void;
  onLogout: () => void;
  onProfileUpdate: (user: any) => void;
  onUpgrade?: () => void;
}

export default function SettingsPage({
  user,
  onBack,
  onLogout,
  onProfileUpdate,
  onUpgrade,
}: SettingsPageProps) {
  const [name, setName] = useState(user?.name || '');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  
  // Change Password Modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await userApi.updateProfile(name);
      if (response.success) {
        setSaved(true);
        onProfileUpdate(response.user);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpdate = async (file: File) => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[SettingsPage] 🖼️ AVATAR UPDATE STARTED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[SettingsPage] File received:', {
      name: file.name,
      size: file.size,
      type: file.type,
    });

    try {
      console.log('[SettingsPage] 📡 Calling POST /users/avatar...');
      const response = await userApi.uploadAvatar(file);
      console.log('[SettingsPage] 📦 API Response:', response);

      if (response?.success && response.user) {
        console.log('[SettingsPage] 🔄 Updating local user state...');
        onProfileUpdate({ ...user, ...response.user });
        toast.success('Avatar atualizado com sucesso!');

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('[SettingsPage] ✅ AVATAR UPDATE COMPLETED');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return;
      }

      console.error('[SettingsPage] ❌ Invalid response structure:', response);
      throw new Error('Resposta inválida do servidor');
    } catch (error) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[SettingsPage] ❌ AVATAR UPDATE FAILED');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[SettingsPage] Error details:', error);

      const message = error instanceof Error ? error.message : 'Erro ao salvar avatar. Tente novamente.';
      throw new Error(message);
    }
  };

  const handleLogout = async () => {
    try {
      await authApi.signout();
      onLogout();
    } catch (error) {
      console.error('Error logging out:', error);
      onLogout(); // Logout anyway
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Por favor, preencha todos os campos');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }

    setPasswordLoading(true);
    try {
      const response = await userApi.changePassword(currentPassword, newPassword);
      if (response.success) {
        toast.success('Senha alterada com sucesso!');
        setShowPasswordModal(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast.error(error.message || 'Erro ao alterar senha');
    } finally {
      setPasswordLoading(false);
    }
  };

  const getPlanName = (planId: string) => {
    const plans: Record<string, string> = {
      free: 'Grátis',
      business: 'Business',
      enterprise: 'Enterprise',
    };
    return plans[planId] || planId;
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'hsl(var(--background))' }}>
      {/* Header */}
      <div 
        className="border-b"
        style={{ 
          backgroundColor: 'hsl(var(--card))',
          borderColor: 'hsl(var(--border))'
        }}
      >
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao Dashboard
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-gray-900 dark:text-gray-100 mb-2">Configurações</h1>
          <p className="text-gray-600 dark:text-gray-500 dark:text-gray-400">
            Gerencie suas preferências e informações da conta
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile">
              <User className="w-4 h-4 mr-2" />
              Perfil
            </TabsTrigger>
            <TabsTrigger value="plan">
              <CreditCard className="w-4 h-4 mr-2" />
              Plano
            </TabsTrigger>
            <TabsTrigger value="webhooks">
              <Webhook className="w-4 h-4 mr-2" />
              Integrações
            </TabsTrigger>
            <TabsTrigger value="security">
              <Shield className="w-4 h-4 mr-2" />
              Segurança
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <div 
              className="rounded-xl shadow-sm border p-6"
              style={{ 
                backgroundColor: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))'
              }}
            >
              <h3 className="mb-6" style={{ color: 'hsl(var(--foreground))' }}>Informações do perfil</h3>

              <div className="space-y-6">
                <AvatarUpload
                  currentAvatar={user?.avatar_url}
                  userName={user?.name || 'Usuário'}
                  onAvatarUpdate={handleAvatarUpdate}
                />

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Nome completo</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      value={user?.email || ''}
                      disabled
                      className="mt-1 bg-gray-50 dark:bg-gray-800"
                    />
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                      O email não pode ser alterado
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleSave}
                      disabled={loading || name === user?.name}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {loading ? (
                        'Salvando...'
                      ) : saved ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Salvo!
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Salvar alterações
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Plan Tab */}
          <TabsContent value="plan" className="space-y-6">
            <div 
              className="rounded-xl shadow-sm border p-6"
              style={{ 
                backgroundColor: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))'
              }}
            >
              <h3 className="mb-6" style={{ color: 'hsl(var(--foreground))' }}>Plano e cobrança</h3>

              <div className="space-y-4">
                <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-lg border border-blue-100 dark:border-blue-900">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-600 dark:text-gray-400 mb-1">Plano atual</p>
                      <p className="text-gray-900 dark:text-gray-100">
                        Plano {getPlanName(user?.plan)}
                      </p>
                    </div>
                    <Zap className="w-8 h-8 text-blue-600" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-gray-600 dark:text-gray-400 mb-1">Leads</p>
                    <p className="text-gray-900 dark:text-gray-100">
                      {user?.usage?.leads || 0} /{' '}
                      {user?.limits?.leads === -1
                        ? '∞'
                        : user?.limits?.leads || 0}
                    </p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-gray-600 dark:text-gray-400 mb-1">Mensagens</p>
                    <p className="text-gray-900 dark:text-gray-100">
                      {user?.usage?.messages || 0} /{' '}
                      {user?.limits?.messages === -1
                        ? '∞'
                        : user?.limits?.messages || 0}
                    </p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-gray-600 dark:text-gray-400 mb-1">Envios em massa</p>
                    <p className="text-gray-900 dark:text-gray-100">
                      {user?.usage?.massMessages || 0} /{' '}
                      {user?.limits?.massMessages === -1
                        ? '∞'
                        : user?.limits?.massMessages || 0}
                    </p>
                  </div>
                </div>

                {user?.plan === 'free' && (
                  <Button
                    onClick={onUpgrade}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Fazer upgrade do plano
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Webhooks Tab */}
          <TabsContent value="webhooks" className="space-y-6">
            <WhatsAppConnection />
            <IntegrationSettings user={user} onUpgrade={onUpgrade} />
            <SMTPSettings user={user} />
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <div 
              className="rounded-xl shadow-sm border p-6"
              style={{ 
                backgroundColor: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))'
              }}
            >
              <h3 className="mb-6" style={{ color: 'hsl(var(--foreground))' }}>Segurança</h3>

              <div className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => setShowPasswordModal(true)}
                >
                  <Lock className="w-4 h-4 mr-2" />
                  Alterar senha
                </Button>
                <Button
                  variant="outline"
                  onClick={handleLogout}
                  className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  Sair da conta
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Change Password Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>
              Digite sua senha atual e escolha uma nova senha
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="current-password">Senha atual</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1"
                placeholder="Digite sua senha atual"
              />
            </div>
            
            <div>
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1"
                placeholder="Digite a nova senha (mín. 6 caracteres)"
              />
            </div>
            
            <div>
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1"
                placeholder="Confirme a nova senha"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowPasswordModal(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
              }}
              disabled={passwordLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={passwordLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {passwordLoading ? 'Alterando...' : 'Alterar senha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

