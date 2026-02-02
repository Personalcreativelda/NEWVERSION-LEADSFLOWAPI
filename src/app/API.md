# 📡 API Documentation - LeadsFlow API

Documentação completa da API do LeadsFlow, incluindo todos os endpoints, autenticação e exemplos.

---

## 📋 Índice

- [Autenticação](#-autenticação)
- [Endpoints](#-endpoints)
- [Modelos de Dados](#-modelos-de-dados)
- [Códigos de Status](#-códigos-de-status)
- [Exemplos de Uso](#-exemplos-de-uso)
- [Rate Limiting](#-rate-limiting)
- [Webhooks](#-webhooks)

---

## 🔐 Autenticação

A API usa **JWT (JSON Web Tokens)** para autenticação via Supabase.

### Headers Necessários

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

### Obter Token

```typescript
// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'usuario@email.com',
  password: 'senha123'
});

const accessToken = data.session?.access_token;
```

### Refresh Token

```typescript
const { data, error } = await supabase.auth.refreshSession();
const newAccessToken = data.session?.access_token;
```

---

## 🚀 Endpoints

### Autenticação

#### POST /auth/signup
Criar nova conta de usuário.

**Request:**
```json
{
  "email": "usuario@email.com",
  "password": "senha123",
  "full_name": "João Silva"
}
```

**Response (201):**
```json
{
  "user": {
    "id": "uuid",
    "email": "usuario@email.com",
    "full_name": "João Silva"
  },
  "session": {
    "access_token": "eyJhbGc...",
    "refresh_token": "...",
    "expires_in": 3600
  }
}
```

#### POST /auth/login
Fazer login.

**Request:**
```json
{
  "email": "usuario@email.com",
  "password": "senha123"
}
```

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "email": "usuario@email.com"
  },
  "session": {
    "access_token": "eyJhbGc...",
    "refresh_token": "..."
  }
}
```

#### POST /auth/logout
Fazer logout.

**Response (200):**
```json
{
  "message": "Logout successful"
}
```

---

### Usuários

#### GET /user/profile
Obter perfil do usuário autenticado.

**Response (200):**
```json
{
  "id": "uuid",
  "email": "usuario@email.com",
  "full_name": "João Silva",
  "avatar_url": "https://...",
  "plan": "business",
  "limits": {
    "leads": 1000,
    "messages": 500,
    "massMessages": 50
  },
  "usage": {
    "leads": 250,
    "messages": 100,
    "massMessages": 10
  }
}
```

#### PUT /user/profile
Atualizar perfil do usuário.

**Request:**
```json
{
  "full_name": "João Silva Santos",
  "phone": "+5511999999999",
  "company": "Empresa XYZ"
}
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "full_name": "João Silva Santos",
    "phone": "+5511999999999"
  }
}
```

---

### Leads

#### GET /leads
Listar todos os leads do usuário.

**Query Parameters:**
- `limit` (opcional): Limite de resultados (padrão: 100)
- `offset` (opcional): Offset para paginação (padrão: 0)
- `status` (opcional): Filtrar por status
- `origem` (opcional): Filtrar por origem
- `search` (opcional): Buscar por nome, email ou telefone

**Response (200):**
```json
{
  "success": true,
  "leads": [
    {
      "id": "uuid",
      "nome": "Maria Santos",
      "email": "maria@email.com",
      "telefone": "+5511999999999",
      "empresa": "Empresa ABC",
      "cargo": "Gerente",
      "origem": "Website",
      "status": "novo",
      "interesse": "Produto X",
      "observacoes": "Lead qualificado",
      "marcado_email": false,
      "data": "2024-01-15T10:30:00Z",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 250,
  "limit": 100,
  "offset": 0
}
```

#### GET /leads/:id
Obter um lead específico.

**Response (200):**
```json
{
  "success": true,
  "lead": {
    "id": "uuid",
    "nome": "Maria Santos",
    "email": "maria@email.com",
    // ... outros campos
  }
}
```

#### POST /leads
Criar novo lead.

**Request:**
```json
{
  "nome": "Pedro Oliveira",
  "email": "pedro@email.com",
  "telefone": "+5511988888888",
  "empresa": "Tech Corp",
  "cargo": "CEO",
  "origem": "LinkedIn",
  "status": "novo",
  "interesse": "Consultoria",
  "observacoes": "Contato via LinkedIn"
}
```

**Response (201):**
```json
{
  "success": true,
  "lead": {
    "id": "uuid",
    "nome": "Pedro Oliveira",
    // ... campos completos
    "created_at": "2024-01-15T11:00:00Z"
  }
}
```

**Errors:**
- `400` - Dados inválidos
- `403` - Limite de leads atingido
- `401` - Não autenticado

#### PUT /leads/:id
Atualizar lead existente.

**Request:**
```json
{
  "status": "qualificado",
  "observacoes": "Reunião agendada para 20/01"
}
```

**Response (200):**
```json
{
  "success": true,
  "lead": {
    "id": "uuid",
    "status": "qualificado",
    // ... campos atualizados
    "updated_at": "2024-01-15T12:00:00Z"
  }
}
```

#### DELETE /leads/:id
Deletar lead.

**Response (200):**
```json
{
  "success": true,
  "message": "Lead deleted successfully"
}
```

#### POST /leads/import
Importar múltiplos leads.

**Request:**
```json
{
  "leads": [
    {
      "nome": "Lead 1",
      "email": "lead1@email.com",
      "telefone": "+5511999999999"
    },
    {
      "nome": "Lead 2",
      "email": "lead2@email.com"
    }
  ]
}
```

**Response (201):**
```json
{
  "success": true,
  "imported": 2,
  "failed": 0,
  "leads": [
    { "id": "uuid1", "nome": "Lead 1" },
    { "id": "uuid2", "nome": "Lead 2" }
  ]
}
```

---

### WhatsApp

#### GET /whatsapp/qrcode
Obter QR Code para conectar WhatsApp.

**Response (200):**
```json
{
  "success": true,
  "qrcode": "data:image/png;base64,iVBORw0KG...",
  "instance": "leadsflow_user_uuid"
}
```

#### GET /whatsapp/status
Verificar status da conexão WhatsApp.

**Response (200):**
```json
{
  "success": true,
  "status": "connected",
  "phone_number": "+5511999999999",
  "last_connected": "2024-01-15T10:00:00Z"
}
```

#### POST /whatsapp/send
Enviar mensagem individual.

**Request:**
```json
{
  "lead_id": "uuid",
  "message": "Olá! Como posso ajudar?"
}
```

**Response (200):**
```json
{
  "success": true,
  "message_id": "msg_uuid",
  "sent_at": "2024-01-15T12:30:00Z"
}
```

#### POST /whatsapp/send-mass
Enviar mensagens em massa.

**Request:**
```json
{
  "lead_ids": ["uuid1", "uuid2", "uuid3"],
  "message": "Olá {{nome}}! Temos uma oferta especial para você."
}
```

**Response (200):**
```json
{
  "success": true,
  "sent": 3,
  "failed": 0,
  "details": [
    {
      "lead_id": "uuid1",
      "status": "sent",
      "message_id": "msg1"
    }
  ]
}
```

---

### Email

#### POST /email/send
Enviar email individual.

**Request:**
```json
{
  "lead_id": "uuid",
  "subject": "Proposta Comercial",
  "message": "Segue nossa proposta..."
}
```

**Response (200):**
```json
{
  "success": true,
  "email_id": "email_uuid",
  "sent_at": "2024-01-15T13:00:00Z"
}
```

#### POST /email/send-mass
Enviar emails em massa.

**Request:**
```json
{
  "lead_ids": ["uuid1", "uuid2"],
  "subject": "Newsletter - Janeiro 2024",
  "message": "Olá {{nome}}, confira nossas novidades..."
}
```

**Response (200):**
```json
{
  "success": true,
  "sent": 2,
  "failed": 0
}
```

---

### Planos e Assinaturas

#### POST /subscription/create-checkout
Criar sessão de checkout do Stripe.

**Request:**
```json
{
  "plan": "business",
  "billing_period": "monthly"
}
```

**Response (200):**
```json
{
  "success": true,
  "checkout_url": "https://checkout.stripe.com/...",
  "session_id": "cs_..."
}
```

#### POST /subscription/cancel
Cancelar assinatura.

**Response (200):**
```json
{
  "success": true,
  "message": "Subscription cancelled",
  "cancelled_at": "2024-01-15T14:00:00Z"
}
```

---

## 📊 Modelos de Dados

### User

```typescript
interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  phone?: string;
  company?: string;
  plan: 'free' | 'business' | 'enterprise';
  subscription_status: 'active' | 'cancelled' | 'expired' | 'trial';
  limits: {
    leads: number;
    messages: number;
    massMessages: number;
  };
  usage: {
    leads: number;
    messages: number;
    massMessages: number;
  };
  created_at: string;
  updated_at: string;
}
```

### Lead

```typescript
interface Lead {
  id: string;
  user_id: string;
  nome: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  cargo?: string;
  origem: string;
  status: string;
  interesse?: string;
  observacoes?: string;
  marcado_email: boolean;
  data: string;
  created_at: string;
  updated_at: string;
}
```

---

## 📡 Códigos de Status

| Código | Significado |
|--------|-------------|
| 200 | OK - Requisição bem-sucedida |
| 201 | Created - Recurso criado com sucesso |
| 400 | Bad Request - Dados inválidos |
| 401 | Unauthorized - Não autenticado |
| 403 | Forbidden - Limite atingido ou sem permissão |
| 404 | Not Found - Recurso não encontrado |
| 429 | Too Many Requests - Rate limit excedido |
| 500 | Internal Server Error - Erro no servidor |

---

## 🔄 Rate Limiting

### Limites

- **Requisições gerais:** 100/minuto por usuário
- **Envio de mensagens:** Baseado no plano
- **Importação de leads:** 10 requisições/hora

### Headers de Rate Limit

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642262400
```

---

## 🪝 Webhooks

### Webhooks N8N

Configure webhooks N8N para sincronizar leads com Google Sheets.

**URL configurada em:** Integrações > Webhooks N8N

**Formato esperado (GET):**

```json
[
  {
    "nome": "Lead do Sheets",
    "email": "lead@email.com",
    "telefone": "+5511999999999",
    "origem": "Google Sheets"
  }
]
```

**Webhook Events:**

- `lead.created` - Novo lead criado
- `lead.updated` - Lead atualizado
- `lead.deleted` - Lead deletado
- `message.sent` - Mensagem enviada

---

## 💡 Exemplos de Uso

### JavaScript/TypeScript

```typescript
const API_URL = 'https://api.leadsflow.com';
const token = 'seu_access_token';

// Listar leads
const response = await fetch(`${API_URL}/leads`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const { leads } = await response.json();

// Criar lead
const newLead = await fetch(`${API_URL}/leads`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    nome: 'João Silva',
    email: 'joao@email.com'
  })
});
```

### cURL

```bash
# Listar leads
curl -X GET https://api.leadsflow.com/leads \
  -H "Authorization: Bearer seu_token" \
  -H "Content-Type: application/json"

# Criar lead
curl -X POST https://api.leadsflow.com/leads \
  -H "Authorization: Bearer seu_token" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Maria Santos",
    "email": "maria@email.com",
    "telefone": "+5511999999999"
  }'
```

---

## 📞 Suporte

Dúvidas sobre a API?

- 📧 Email: api@personalcreativelda.com
- 📖 Documentação: [README.md](README.md)

---

<div align="center">

**API v1.0.0**

[⬆ Voltar ao topo](#-api-documentation---leadsflow-api)

</div>
