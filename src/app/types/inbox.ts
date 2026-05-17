// INBOX: TypeScript interfaces para o módulo Inbox
// Compartilhado entre frontend e backend

export type ChannelType = 'whatsapp' | 'whatsapp_cloud' | 'facebook' | 'instagram' | 'telegram' | 'email' | 'website' | 'sms' | 'twilio_sms';
export type WhatsAppProvider = 'evolution_api' | 'cloud_api';

export interface Channel {
    id: string;
    user_id: string;
    type: ChannelType;
    name: string;
    status: 'active' | 'inactive' | 'error' | 'connecting';
    provider?: WhatsAppProvider; // Para diferenciar Evolution API vs Cloud API
    credentials: {
        // Evolution API (WhatsApp)
        instance_id?: string;
        instance_name?: string;
        phone_number?: string;
        // WhatsApp Cloud API
        phone_number_id?: string;
        waba_id?: string; // WhatsApp Business Account ID
        business_id?: string;
        access_token?: string;
        verify_token?: string;
        // Facebook
        page_id?: string;
        page_access_token?: string;
        page_name?: string;
        // Instagram
        instagram_id?: string;
        // Twilio SMS
        accountSid?: string;
        authToken?: string;
        phoneNumber?: string;
        username?: string;
        // Telegram
        bot_token?: string;
        bot_username?: string;
        bot_id?: number;
        // Allow additional properties
        [key: string]: any;
    };
    settings: {
        auto_reply?: boolean;
        webhook_url?: string;
        business_hours?: {
            enabled: boolean;
            timezone: string;
            schedule: Record<string, { start: string; end: string }>;
        };
    };
    last_sync_at?: string;
    created_at: string;
    updated_at: string;
}

export interface Conversation {
    id: string;
    user_id: string;
    lead_id: string | null;
    channel_id: string;
    remote_jid: string;
    status: 'open' | 'closed' | 'pending' | 'resolved' | 'snoozed';
    assigned_to: string | null;
    assignee_id?: string | null;
    assignee?: { id: string; name: string; email: string } | null;
    assigned_team?: string | null;
    assigned_at?: string | null;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    last_message_at: string;
    unread_count: number;
    metadata: {
        contact_name?: string;
        phone?: string;
        email?: string;
        profile_picture?: string;
        tags?: string[];
        is_group?: boolean;
        group_name?: string;
        group_description?: string;
        group_owner?: string;
        group_picture?: string;
        participants_count?: number;
        lead_status?: string;
        [key: string]: any;
    };
    created_at: string;
    updated_at: string;
}

// Team management types
export interface TeamMember {
    id: string;
    owner_id: string;
    user_id: string | null;
    email: string;
    name: string;
    role: 'admin' | 'manager' | 'agent' | 'viewer';
    team: string | null;
    is_active: boolean;
    invited_at: string;
    accepted_at: string | null;
    avatar_url: string | null;
    open_conversations?: number;
    created_at: string;
    updated_at: string;
}

export interface InternalNote {
    id: string;
    conversation_id: string;
    author_id: string;
    author_name: string;
    author_email: string;
    content: string;
    created_at: string;
    updated_at: string;
}

export interface ActivityLog {
    id: string;
    conversation_id: string;
    actor_id: string | null;
    actor_name: string | null;
    action: string;
    metadata: Record<string, any>;
    created_at: string;
}

export interface AssignmentHistory {
    id: string;
    conversation_id: string;
    assignee_id: string | null;
    assignee_name: string | null;
    assignee_email: string | null;
    assigned_team: string | null;
    assigned_by: string | null;
    assigned_by_name: string | null;
    note: string | null;
    created_at: string;
}

export interface RoutingRule {
    id: string;
    owner_id: string;
    name: string;
    is_active: boolean;
    priority: number;
    conditions: Array<{ field: string; operator: string; value: string }>;
    action_type: 'assign_agent' | 'assign_team' | 'round_robin' | 'least_busy';
    action_data: Record<string, any>;
    created_at: string;
    updated_at: string;
}

export interface Message {
    id: string;
    user_id: string;
    conversation_id: string;
    lead_id: string | null;
    contact_id: string | null;
    campaign_id: string | null;
    direction: 'in' | 'out';
    channel: 'whatsapp' | 'whatsapp_cloud' | 'facebook' | 'instagram' | 'telegram' | 'email' | 'website' | 'sms';
    content: string;
    media_url?: string;
    media_type?: 'image' | 'video' | 'audio' | 'document';
    status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
    external_id?: string;
    metadata: {
        quoted_message_id?: string;
        reactions?: Array<{ emoji: string; from: string }>;
        forwarded?: boolean;
    };
    sent_at?: string;
    delivered_at?: string;
    read_at?: string;
    created_at: string;
}

export interface AIAssistant {
    id: string;
    user_id: string;
    channel_id: string | null;
    name: string;
    mode: 'webhook' | 'llm';
    webhook_url?: string;
    webhook_headers?: Record<string, string>;
    llm_provider?: 'gemini' | 'openai' | 'anthropic';
    llm_model?: string;
    llm_system_prompt?: string;
    settings: {
        enabled: boolean;
        auto_respond: boolean;
        business_hours_only?: boolean;
        max_tokens?: number;
        temperature?: number;
        fallback_to_human?: boolean;
        trigger_keywords?: string[];
        exclude_keywords?: string[];
        monthly_message_limit?: number;
    };
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface ConversationTagInfo {
    id: string;
    name: string;
    color: string;
    icon?: string;
}

// Extended types com dados relacionados
export interface ConversationWithDetails extends Conversation {
    is_group?: boolean;
    contact?: {
        id: string;
        name: string;
        email?: string;
        phone?: string;
        avatar_url?: string;
        is_group?: boolean;
        status?: string;
        company?: string;
        source?: string;
        tags?: string[];
    };
    lead?: {
        id: string;
        name: string;
        email?: string;
        phone?: string;
        avatar_url?: string;
    };
    channel?: {
        id: string;
        type: string;
        name: string;
        status: string;
        provider?: string | null;
    };
    last_message?: {
        id: string;
        content: string;
        direction: 'in' | 'out';
        status: string;
        created_at: string;
        media_url?: string;
        media_type?: string;
    };
    conversation_tags?: ConversationTagInfo[];
}

export interface MessageWithSender extends Message {
    sender?: {
        id: string;
        name: string;
        avatar_url?: string;
    };
    /** Object URL for local preview while the attachment is still uploading (optimistic bubble) */
    localPreviewUrl?: string;
    /** 0–100 upload progress; only present while status === 'uploading' in an optimistic bubble */
    uploadProgress?: number;
}

// WebSocket event types
export interface WebSocketEvents {
    connected: {
        message: string;
        userId: string;
        timestamp: string;
    };
    new_message: {
        conversationId: string;
        message: Message;
        conversation?: Partial<Conversation>;
        timestamp: string;
    };
    message_status_update: {
        messageId: string;
        conversationId: string;
        status: Message['status'];
        timestamp: string;
    };
    conversation_update: {
        conversationId: string;
        updates: Partial<Conversation>;
        timestamp: string;
    };
    unread_count_update: {
        totalUnread: number;
        conversationId?: string;
        unreadCount?: number;
        timestamp: string;
    };
    conversation_read: {
        conversationId: string;
        timestamp: string;
    };
    user_typing: {
        conversationId: string;
        isTyping: boolean;
        timestamp: string;
    };
}

// API Response types
export interface ApiResponse<T> {
    success?: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}
