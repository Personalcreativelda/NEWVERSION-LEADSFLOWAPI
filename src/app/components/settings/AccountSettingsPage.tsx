import { useState, useEffect } from 'react';
import { SettingsHub, Group, Row } from './SettingsHub';
import { ProfileSection } from './ProfileSection';
import { Loader2, Shield, Key, Smartphone, Copy, Trash2, Plus, Eye, EyeOff, Lock, Users, UserCog, ChevronRight } from 'lucide-react';
import { PageHeader } from '../base/PageHeader';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { toast } from "sonner";
import { getApiBaseUrl } from '../../utils/api-client';
import { useConfirm } from '../ui/ConfirmDialog';
import { TeamSettingsPage } from './TeamSettingsPage';
import { getLocale } from '../../utils/format';

interface AccountSettingsPageProps {
  user: any;
  onUpdateUser: (updates: any) => void;
  initialTab?: TabType;
  /** Definições gerais (Canais, Suporte, terminar sessão) no topo da página */
  onOpenChannels?: () => void;
  onHelp?: () => void;
  onFeedback?: () => void;
  onLogout?: () => void;
}

interface ApiToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

type TabType = 'profile' | 'security' | 'team';

export default function AccountSettingsPage({ user, onUpdateUser, initialTab, onOpenChannels, onHelp, onFeedback, onLogout }: AccountSettingsPageProps) {
  const confirm = useConfirm();
  // null = lista; uma secção = subpágina (com entrada no histórico: voltar fecha-a)
  const [activeTab, setActiveTab] = useState<TabType | null>(initialTab || null);
  const openSection = (section: TabType) => {
    window.history.pushState({ subpage: true, accountSection: section }, '');
    setActiveTab(section);
  };
  // Fechar a subpágina: seta do cabeçalho / botão voltar do Android (history.back → popstate)
  useEffect(() => {
    if (initialTab) return; // aberta diretamente numa secção (ex.: /segurança)
    const onPop = () => setActiveTab((window.history.state?.accountSection as TabType) || null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [initialTab]);
  const [loading, setLoading] = useState(false);

  // ── Security state ────────────────────────────────────────────────────────
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  // 2FA Setup Modal
  const [show2FASetupModal, setShow2FASetupModal] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationCode, setVerificationCode] = useState('');
  const [setupStep, setSetupStep] = useState<'qr' | 'verify' | 'backup'>('qr');

  // 2FA Disable Modal
  const [show2FADisableModal, setShow2FADisableModal] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');

  // API Tokens
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [showNewTokenModal, setShowNewTokenModal] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenExpireDays, setNewTokenExpireDays] = useState('90');
  const [generatedToken, setGeneratedToken] = useState('');
  const [showGeneratedToken, setShowGeneratedToken] = useState(false);

  // Password Change Modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    load2FAStatus();
    loadTokens();
  }, []);

  // Sync tab when initialTab prop changes (e.g. navigating from security route)
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('leadflow_access_token');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  };

  const getApiUrl = (path: string) => {
    const baseUrl = getApiBaseUrl();
    return `${baseUrl}/api${path}`;
  };

  // ── Security helpers ──────────────────────────────────────────────────────
  const load2FAStatus = async () => {
    try {
      const response = await fetch(getApiUrl('/security/2fa/status'), { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setTwoFactorEnabled(data.enabled);
      }
    } catch {}
  };

  const loadTokens = async () => {
    try {
      const response = await fetch(getApiUrl('/security/tokens'), { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setTokens(data.tokens || []);
      }
    } catch {}
  };

  const handleSetup2FA = async () => {
    setLoading(true);
    try {
      const response = await fetch(getApiUrl('/security/2fa/setup'), { method: 'POST', headers: getAuthHeaders() });
      if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Erro ao configurar 2FA'); }
      const data = await response.json();
      setQrCode(data.qrCode); setSecret(data.secret); setBackupCodes(data.backupCodes || []);
      setSetupStep('qr'); setShow2FASetupModal(true);
    } catch (e: any) { toast.error(e.message || 'Erro ao configurar 2FA'); }
    finally { setLoading(false); }
  };

  const handleVerify2FA = async () => {
    if (!verificationCode || verificationCode.length !== 6) { toast.error('Escreva o código de 6 dígitos'); return; }
    setLoading(true);
    try {
      const response = await fetch(getApiUrl('/security/2fa/verify'), { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ code: verificationCode }) });
      if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Código inválido'); }
      setSetupStep('backup'); setTwoFactorEnabled(true); toast.success('2FA ativado com sucesso!');
    } catch (e: any) { toast.error(e.message || 'Código inválido'); }
    finally { setLoading(false); }
  };

  const handleDisable2FA = async () => {
    if (!disablePassword) { toast.error('Escreva a sua palavra-passe'); return; }
    setLoading(true);
    try {
      const response = await fetch(getApiUrl('/security/2fa/disable'), { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ password: disablePassword }) });
      if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Erro ao desativar 2FA'); }
      setTwoFactorEnabled(false); setShow2FADisableModal(false); setDisablePassword(''); toast.success('2FA desativado com sucesso');
    } catch (e: any) { toast.error(e.message || 'Erro ao desativar 2FA'); }
    finally { setLoading(false); }
  };

  const handleCreateToken = async () => {
    if (!newTokenName.trim()) { toast.error('Escreva um nome para o token'); return; }
    setLoading(true);
    try {
      const response = await fetch(getApiUrl('/security/tokens'), { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ name: newTokenName, expiresInDays: parseInt(newTokenExpireDays) || null }) });
      if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Erro ao criar token'); }
      const data = await response.json();
      setGeneratedToken(data.apiToken); setShowGeneratedToken(true); loadTokens(); setNewTokenName('');
      toast.success('Token criado com sucesso!', { description: 'Copie o token agora: não o vai poder ver de novo.' });
    } catch (e: any) { toast.error(e.message || 'Erro ao criar token'); }
    finally { setLoading(false); }
  };

  const handleDeleteToken = async (tokenId: string) => {
    const confirmed = await confirm('Tem certeza que deseja apagar este token? Esta ação não pode ser desfeita.', { title: 'Eliminar token', confirmLabel: 'Eliminar', variant: 'danger' });
    if (!confirmed) return;
    setLoading(true);
    try {
      const response = await fetch(getApiUrl(`/security/tokens/${tokenId}`), { method: 'DELETE', headers: getAuthHeaders() });
      if (!response.ok) throw new Error('Erro ao eliminar o token');
      loadTokens(); toast.success('Token apagado com sucesso');
    } catch (e: any) { toast.error(e.message || 'Erro ao apagar token'); }
    finally { setLoading(false); }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) { toast.error('Escreva a sua palavra-passe atual'); return; }
    if (!newPassword || newPassword.length < 8) { toast.error('A nova palavra-passe deve ter pelo menos 8 caracteres'); return; }
    if (newPassword !== confirmPassword) { toast.error('As palavras-passe não coincidem'); return; }
    setLoading(true);
    try {
      const response = await fetch(getApiUrl('/security/change-password'), { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ currentPassword, newPassword }) });
      if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Erro ao alterar senha'); }
      setShowPasswordModal(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      toast.success('Palavra-passe alterada com sucesso!', { description: 'Enviámos-lhe um email de confirmação.' });
    } catch (e: any) { toast.error(e.message || 'Erro ao alterar palavra-passe'); }
    finally { setLoading(false); }
  };

  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copiado'); };
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString(getLocale()) : 'Nunca';
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader title="Definições" description="Perfil, segurança, equipa, canais e suporte" icon={UserCog} />

      {activeTab === null && (
        <SettingsHub
          onOpenChannels={onOpenChannels}
          onHelp={onHelp}
          onFeedback={onFeedback}
          onLogout={onLogout}
          before={
            <Group title="Conta">
              <button
                type="button"
                onClick={() => openSection('profile')}
                className="flex w-full min-h-[64px] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 active:bg-muted"
              >
                <Avatar key={user?.avatar_url || 'none'} className="h-10 w-10 flex-shrink-0">
                  <AvatarImage src={user?.avatar_url || undefined} alt="" />
                  <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
                    {(user?.name || '').split(' ').filter(Boolean).map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-foreground">{user?.name || 'Perfil'}</span>
                  <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
                </span>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              </button>
              <Row icon={Shield} label="Segurança" hint="Palavra-passe, verificação em dois passos e tokens" onClick={() => openSection('security')} />
              <Row icon={Users} label="Equipa" hint="Membros e permissões" onClick={() => openSection('team')} />
            </Group>
          }
        />
      )}

      {activeTab !== null && (
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-foreground">{({ profile: 'Perfil', security: 'Segurança', team: 'Equipa' })[activeTab]}</h2>
        </div>
      )}

      <div>
        {activeTab === 'profile' && <ProfileSection user={user} onUpdateUser={onUpdateUser} />}

        {activeTab === 'team' && (
          <TeamSettingsPage currentUser={user} />
        )}

        {activeTab === 'security' && (
          <div className="space-y-4">
            {/* Two-Factor Authentication */}
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Smartphone className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground mb-1">Verificação em dois passos</h3>
                    <p className="text-sm text-muted-foreground mb-4">Uma camada extra de segurança com uma aplicação de autenticação</p>
                    <div className="flex items-center gap-2">
                      {twoFactorEnabled ? (
                        <><div className="w-2 h-2 bg-green-500 rounded-full" /><span className="text-sm text-green-600 dark:text-green-400">Ativado</span></>
                      ) : (
                        <><div className="w-2 h-2 bg-muted-foreground/60 rounded-full" /><span className="text-sm text-muted-foreground">Desativado</span></>
                      )}
                    </div>
                  </div>
                </div>
                <Button onClick={twoFactorEnabled ? () => setShow2FADisableModal(true) : handleSetup2FA} variant={twoFactorEnabled ? 'outline' : 'default'} className={twoFactorEnabled ? '' : 'bg-green-600 hover:bg-green-700 text-white'} disabled={loading}>
                  {twoFactorEnabled ? 'Desativar' : 'Ativar'}
                </Button>
              </div>
            </div>

            {/* Password Change */}
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Lock className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground mb-1">Alterar palavra-passe</h3>
                    <p className="text-sm text-muted-foreground">Mude a palavra-passe com regularidade para manter a conta segura</p>
                  </div>
                </div>
                <Button onClick={() => setShowPasswordModal(true)} variant="outline" disabled={loading}>Alterar palavra-passe</Button>
              </div>
            </div>

            {/* API Tokens */}
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                    <Key className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground mb-1">Tokens de API</h3>
                    <p className="text-sm text-muted-foreground">Tokens para aceder à API do LeadsFlow</p>
                  </div>
                </div>
                <Button onClick={() => setShowNewTokenModal(true)} size="sm">
                  <Plus className="w-4 h-4 mr-2" />Novo token
                </Button>
              </div>
              <div className="space-y-3">
                {tokens.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">Nenhum token criado ainda</div>
                ) : (
                  tokens.map((token) => (
                    <div key={token.id} className="bg-muted rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground">{token.name}</span>
                        <Button onClick={() => handleDeleteToken(token.id)} variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 h-8">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <code className="text-sm text-muted-foreground font-mono block mb-2">{token.token_prefix}</code>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Criado: {formatDate(token.created_at)}</span>
                        {token.last_used_at && <span>Último uso: {formatDate(token.last_used_at)}</span>}
                        {token.expires_at && <span>Expira: {formatDate(token.expires_at)}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Security Modals ───────────────────────────────────────────────── */}
      {/* 2FA Setup Modal */}
      <Dialog open={show2FASetupModal} onOpenChange={setShow2FASetupModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar verificação em dois passos</DialogTitle>
            <DialogDescription>
              {setupStep === 'qr' && 'Leia o código QR com a sua aplicação de autenticação'}
              {setupStep === 'verify' && 'Escreva o código de 6 dígitos da aplicação'}
              {setupStep === 'backup' && 'Guarde estes códigos de recuperação num local seguro'}
            </DialogDescription>
          </DialogHeader>
          {setupStep === 'qr' && (
            <div className="space-y-4">
              <div className="bg-card p-4 rounded-lg flex justify-center">
                {qrCode && <img src={qrCode} alt="QR Code" className="w-64 h-64" />}
              </div>
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Ou escreva manualmente:</p>
                <code className="text-sm font-mono">{secret}</code>
              </div>
              <Button onClick={() => setSetupStep('verify')} className="w-full">Próximo</Button>
            </div>
          )}
          {setupStep === 'verify' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="verification-code">Código de verificação</Label>
                <Input id="verification-code" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="text-center text-2xl font-mono mt-1.5" maxLength={6} />
              </div>
              <Button onClick={handleVerify2FA} disabled={loading} className="w-full">{loading ? 'A verificar...' : 'Verificar e ativar'}</Button>
            </div>
          )}
          {setupStep === 'backup' && (
            <div className="space-y-4">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">Guarde estes códigos num local seguro. Servem para entrar na conta se perder o acesso ao telemóvel.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code, i) => <code key={i} className="bg-muted p-2 rounded text-sm font-mono text-center">{code}</code>)}
              </div>
              <Button onClick={() => { setShow2FASetupModal(false); setSetupStep('qr'); setVerificationCode(''); }} className="w-full">Concluir</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 2FA Disable Modal */}
      <Dialog open={show2FADisableModal} onOpenChange={setShow2FADisableModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Desativar verificação em dois passos</DialogTitle>
            <DialogDescription>Escreva a sua palavra-passe para confirmar a desativação do 2FA</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="disable-password">Palavra-passe</Label>
              <Input id="disable-password" type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} placeholder="Escreva a sua palavra-passe" className="mt-1.5" />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShow2FADisableModal(false)} variant="outline" className="flex-1">Cancelar</Button>
              <Button onClick={handleDisable2FA} disabled={loading} variant="destructive" className="flex-1">{loading ? 'A desativar...' : 'Desativar 2FA'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Token Modal */}
      <Dialog open={showNewTokenModal} onOpenChange={setShowNewTokenModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar Novo token de API</DialogTitle>
            <DialogDescription>Crie um token para aceder à API do LeadsFlow</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!showGeneratedToken ? (
              <>
                <div>
                  <Label htmlFor="token-name">Nome do token</Label>
                  <Input id="token-name" value={newTokenName} onChange={(e) => setNewTokenName(e.target.value)} placeholder="Ex: Integração Mobile" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="token-expire">Expira em (dias)</Label>
                  <Input id="token-expire" type="number" value={newTokenExpireDays} onChange={(e) => setNewTokenExpireDays(e.target.value)} placeholder="90" className="mt-1.5" />
                  <p className="text-xs text-muted-foreground mt-1">Deixe vazio para nunca expirar</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setShowNewTokenModal(false)} variant="outline" className="flex-1">Cancelar</Button>
                  <Button onClick={handleCreateToken} disabled={loading} className="flex-1">{loading ? 'A criar...' : 'Criar token'}</Button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-2">Copie este token agora!</p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">Depois de fechar esta janela não o vai poder ver de novo.</p>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs">O seu token de API</Label>
                    <Button onClick={() => copyToClipboard(generatedToken)} size="sm" variant="ghost"><Copy className="w-4 h-4" /></Button>
                  </div>
                  <code className="text-xs font-mono break-all">{generatedToken}</code>
                </div>
                <Button onClick={() => { setShowNewTokenModal(false); setShowGeneratedToken(false); setGeneratedToken(''); }} className="w-full">Concluir</Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Change Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar palavra-passe</DialogTitle>
            <DialogDescription>Escreva a sua palavra-passe atual e a nova palavra-passe desejada</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="current-password">Palavra-passe atual</Label>
              <div className="relative mt-1.5">
                <Input id="current-password" type={showCurrentPassword ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Escreva a sua palavra-passe atual" />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="new-password">Nova palavra-passe</Label>
              <div className="relative mt-1.5">
                <Input id="new-password" type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Nova palavra-passe (mín. 8 caracteres)" />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowNewPassword(!showNewPassword)}>
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirmar nova palavra-passe</Label>
              <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirme a nova palavra-passe" className="mt-1.5" />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => { setShowPasswordModal(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }} variant="outline" className="flex-1">Cancelar</Button>
              <Button onClick={handleChangePassword} disabled={loading} className="flex-1">{loading ? 'A alterar...' : 'Alterar palavra-passe'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
