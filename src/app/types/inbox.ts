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
    status: 'open' | 'closed' | 'pending' | 'snoozed';
    assigned_to: string | null;
    last_message_at: string;
    unread_count: number;
    metadata: {
        contact_name?: string;
        phone?: string;
        email?: string;
        profile_picture?: string;
        tags?: string[];
        is_group?: boolean;
    };
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
    llm_api_key?: string;
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
