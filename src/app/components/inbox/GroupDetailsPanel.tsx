// INBOX: Painel lateral de detalhes do grupo WhatsApp
import React, { useState, useEffect } from 'react';
import { X, Users, Link2, Copy, Loader2, Shield, ShieldCheck, User, Info, Check } from 'lucide-react';
import { groupsApi } from '../../services/api/inbox';
import type { GroupInfo, GroupMember } from '../../services/api/inbox';
import { toast } from 'sonner';

interface GroupDetailsPanelProps {
  conversation: any;
  onClose: () => void;
}

export function GroupDetailsPanel({ conversation, onClose }: GroupDetailsPanelProps) {
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'members'>('info');

  const conversationId = conversation.id;
  const meta = conversation.metadata || {};

  // Load group info
  useEffect(() => {
    if (!conversationId) return;
    
    setLoading(true);
    groupsApi.getInfo(conversationId)
      .then(info => {
        setGroupInfo(info);
      })
      .catch(err => {
        console.error('[GroupDetailsPanel] Error loading group info:', err);
        // Use cached metadata as fallback
        setGroupInfo({
          id: conversationId,
          jid: conversation.remote_jid || '',
          subject: meta.group_name || meta.contact_name || 'Grupo',
          description: meta.group_description || '',
          owner: meta.group_owner || '',
          participants_count: meta.participants_count || 0,
          profile_picture: meta.group_picture || meta.profile_picture || null,
          _source: 'cache',
        });
      })
      .finally(() => setLoading(false));
  }, [conversationId]);

  // Load members when tab switches
  useEffect(() => {
    if (activeTab !== 'members' || members.length > 0) return;
    
    setLoadingMembers(true);
    groupsApi.getMembers(conversationId)
      .then(data => {
        setMembers(data.members || []);
      })
      .catch(err => {
        console.error('[GroupDetailsPanel] Error loading members:', err);
      })
      .finally(() => setLoadingMembers(false));
  }, [activeTab, conversationId]);

  const handleCopyInviteLink = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      return;
    }

    setLoadingInvite(true);
    try {
      const result = await groupsApi.getInviteLink(conversationId);
      setInviteLink(result.invite_link);
      await navigator.clipboard.writeText(result.invite_link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast?.success?.('Link copiado!');
    } catch (err: any) {
      console.error('[GroupDetailsPanel] Error getting invite link:', err);
      toast?.error?.('Não foi possível gerar o link de convite');
    } finally {
      setLoadingInvite(false);
    }
  };

  const groupName = groupInfo?.subject || meta.group_name || meta.contact_name || 'Grupo';
  const groupPicture = groupInfo?.profile_picture || meta.group_picture || meta.profile_picture;
  const participantsCount = groupInfo?.participants_count || meta.participants_count || members.length || 0;

  const getRoleIcon = (role: string) => {
    if (role === 'superadmin') return <ShieldCheck size={14} className="text-yellow-500" />;
    if (role === 'admin') return <Shield size={14} className="text-blue-500" />;
    return null;
  };

  const getRoleLabel = (role: string) => {
    if (role === 'superadmin') return 'Criador';
    if (role === 'admin') return 'Admin';
    return 'Membro';
  };

  return (
    <div className="flex flex-col h-full w-full" style={{ backgroundColor: 'hsl(var(--card))' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
          Detalhes do Grupo
        </h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-all">
          <X size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Group Avatar & Name */}
          <div className="flex flex-col items-center p-6 pb-4">
            {groupPicture ? (
              <img 
                src={groupPicture} 
                alt={groupName} 
                className="w-20 h-20 rounded-full object-cover mb-3"
              />
            ) : (
              <div 
                className="w-20 h-20 rounded-full flex items-center justify-center mb-3 bg-gradient-to-br from-green-500 to-green-600"
              >
                <Users className="w-9 h-9 text-white" />
              </div>
            )}
            <h2 className="text-base font-bold text-center" style={{ color: 'hsl(var(--foreground))' }}>
              {groupName}
            </h2>
            <span className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Grupo · {participantsCount} participantes
            </span>
          </div>

          {/* Tabs */}
          <div className="flex border-b mx-4" style={{ borderColor: 'hsl(var(--border))' }}>
            {([
              { key: 'info' as const, label: 'Informações', icon: Info },
              { key: 'members' as const, label: `Membros (${participantsCount})`, icon: Users },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-all ${
                  activeTab === key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent'
                }`}
                style={activeTab !== key ? { color: 'hsl(var(--muted-foreground))' } : undefined}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'info' && (
            <div className="p-4 space-y-4">
              {/* Description */}
              {groupInfo?.description && (
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Descrição
                  </label>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'hsl(var(--foreground))' }}>
                    {groupInfo.description}
                  </p>
                </div>
              )}

              {/* Group JID */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  ID do Grupo
                </label>
                <p className="text-xs font-mono break-all" style={{ color: 'hsl(var(--foreground))' }}>
                  {conversation.remote_jid}
                </p>
              </div>

              {/* Invite Link */}
              <div>
                <button
                  onClick={handleCopyInviteLink}
                  disabled={loadingInvite}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border"
                  style={{ 
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                    backgroundColor: 'hsl(var(--muted))',
                  }}
                >
                  {loadingInvite ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : copiedLink ? (
                    <Check size={16} className="text-green-500" />
                  ) : (
                    <Link2 size={16} />
                  )}
                  {copiedLink ? 'Link copiado!' : 'Copiar link de convite'}
                </button>
              </div>

              {/* Group Settings Info */}
              {(groupInfo?.restrict || groupInfo?.announce) && (
                <div className="space-y-2">
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Configurações
                  </label>
                  {groupInfo?.announce && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      <Shield size={12} />
                      Apenas admins podem enviar mensagens
                    </div>
                  )}
                  {groupInfo?.restrict && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      <Shield size={12} />
                      Apenas admins podem editar info do grupo
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'members' && (
            <div className="p-2">
              {loadingMembers ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                </div>
              ) : members.length === 0 ? (
                <div className="text-center p-8">
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Não foi possível carregar os membros
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {/* Sort: superadmin > admin > member */}
                  {[...members]
                    .sort((a, b) => {
                      const order: Record<string, number> = { superadmin: 0, admin: 1, member: 2 };
                      return (order[a.role] ?? 2) - (order[b.role] ?? 2);
                    })
                    .map((member, idx) => (
                      <div
                        key={member.jid || idx}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-all"
                      >
                        <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-gray-400 to-gray-500">
                          {member.profile_picture ? (
                            <img src={member.profile_picture} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <User size={14} className="text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate" style={{ color: 'hsl(var(--foreground))' }}>
                              {member.name || member.phone || 'Desconhecido'}
                            </span>
                            {getRoleIcon(member.role)}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              +{member.phone}
                            </span>
                            {member.role !== 'member' && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                member.role === 'superadmin' 
                                  ? 'bg-yellow-500/10 text-yellow-600' 
                                  : 'bg-blue-500/10 text-blue-600'
                              }`}>
                                {getRoleLabel(member.role)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
