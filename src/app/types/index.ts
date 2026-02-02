// Tipos TypeScript para o CRM

export interface Lead {
  id?: string;
  nome: string;
  email?: string;
  telefone: string;
  interesse: string;
  origem: string;
  status: string;
  data?: string;
  createdAt?: string;
  agente_atual?: string;
  observacao?: string;
  observacoes?: string;
  marcado_email?: boolean;
  valor?: number;
  deal_value?: number;
  avatarUrl?: string | null;
  updatedAt?: string;
  convertedAt?: string;
  empresa?: string;
}

export interface LeadNote {
  id: string;
  user_id: string;
  lead_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduledConversation {
  id: string;
  user_id: string;
  lead_id: string;
  title: string;
  description?: string;
  scheduled_at: string;
  status: 'pending' | 'completed' | 'cancelled';
  lead_name?: string;
  lead_phone?: string;
  lead_email?: string;
  created_at: string;
  updated_at: string;
}

export interface InboxConversation {
  // From Evolution API
  remote_jid?: string;
  phone?: string;
  name?: string;
  profile_picture?: string | null;
  // From local database
  lead_id?: string | null;
  lead_name?: string;
  lead_phone?: string;
  lead_email?: string;
  lead_whatsapp?: string;
  lead_status?: string;
  lead_company?: string;
  // Common fields
  last_message: string;
  last_direction: 'in' | 'out';
  last_channel?: string;
  last_status?: string;
  last_message_at: string;
  unread_count: number;
}

export interface Message {
  id: string;
  user_id: string;
  contact_id?: string;
  lead_id?: string;
  campaign_id?: string;
  direction: 'in' | 'out';
  channel: string;
  content: string;
  media_url?: string;
  media_type?: string;
  status: string;
  external_id?: string;
  metadata?: any;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  created_at: string;
}

export interface PlanoLimites {
  plano: 'gratuito' | 'basico' | 'profissional' | 'enterprise' | 'teste';
  envios_usados: number;
  envios_limite: number;
  importacoes_usadas: number;
  importacoes_limite: number;
  leads_usados: number;
  leads_limite: number;
  data_reset?: string;
}

export interface WebhookConfig {
  httpEndpoint?: string; // Endpoint HTTP para receber leads (apenas Professional+)
  metaPixelId?: string; // Meta Pixel ID
  googleAnalyticsId?: string; // Google Analytics ID
}

export interface PeriodoTeste {
  email: string;
  dataCriacao: string;
  dataExpiracao: string;
  plano: string;
  status: string;
  diasTeste: number;
  diasRestantes?: number;
  expirado?: boolean;
}

export interface Usuario {
  id?: string;
  nome: string;
  email: string;
  senha?: string;
}

export interface Sessao {
  usuario: string;
  userId?: string;
  timestamp: number;
}
