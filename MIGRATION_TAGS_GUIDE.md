# Guia de Migração: Sistema de Etiquetas para Conversas

## 📋 Resumo

Esta migração cria o sistema completo de etiquetas personalizáveis para conversas no Inbox.

### O que será criado:

#### **Tabelas**
- `conversation_tags` - Armazena as etiquetas criadas pelos usuários
- `conversation_tag_assignments` - Relacionamento muitos-para-muitos entre conversas e tags

#### **Views**
- `conversations_with_tags` - Conversas com suas tags agregadas em JSON
- `conversation_tags_stats` - Estatísticas de uso de cada etiqueta

#### **Índices**
- Índices otimizados para consultas por `user_id`, `conversation_id`, `tag_id`
- Constraint único para evitar duplicação de tags em conversas

---

## 🚀 Como Executar

### Opção 1: Via npm script (Recomendado)

```bash
cd api
npm run migrate:tags
```

### Opção 2: Via ts-node diretamente

```bash
cd api
npx ts-node src/database/run-tags-migration.ts
```

### Opção 3: Via psql (PostgreSQL nativo)

```bash
psql -U seu_usuario -d leadflow_db -f api/src/database/migrations/011_conversation_tags.sql
```

---

## ✅ Verificação

Após executar a migração, verifique no PostgreSQL:

```sql
-- Verificar se as tabelas foram criadas
\dt conversation_tags
\dt conversation_tag_assignments

-- Verificar se as views foram criadas
\dv conversations_with_tags
\dv conversation_tags_stats

-- Verificar indices
\di idx_conversation_tags_user_id
\di idx_conv_tag_assignments_conversation
```

---

## 🔄 Rollback (Se necessário)

Caso precise reverter a migração:

```sql
DROP VIEW IF EXISTS conversation_tags_stats CASCADE;
DROP VIEW IF EXISTS conversations_with_tags CASCADE;
DROP TABLE IF EXISTS conversation_tag_assignments CASCADE;
DROP TABLE IF EXISTS conversation_tags CASCADE;
```

---

## 📊 Uso no Sistema

Após a migração ser executada:

1. **Frontend**: As etiquetas aparecerão automaticamente na sidebar do Inbox
2. **API**: Todos os 10 endpoints estão prontos para uso:
   - `GET /api/inbox/conversation-tags` - Listar tags
   - `POST /api/inbox/conversation-tags` - Criar tag
   - `PUT /api/inbox/conversation-tags/:id` - Editar tag
   - `DELETE /api/inbox/conversation-tags/:id` - Deletar tag
   - E mais 6 endpoints para gerenciar tags em conversas

3. **Funcionalidades Disponíveis**:
   - ✅ Criar etiquetas com cores e ícones personalizados
   - ✅ Adicionar/remover tags de conversas
   - ✅ Filtrar conversas por tag
   - ✅ Reordenar tags (drag-drop)
   - ✅ Ver estatísticas de uso

---

## 🐛 Troubleshooting

### Erro: "relation already exists"
A migração já foi executada anteriormente. Não é necessário rodar novamente.

### Erro: "function update_updated_at_column does not exist"
Execute primeiro as migrações anteriores que criam essa função.

### Erro: "permission denied"
Verifique se o usuário do banco tem permissões `CREATE TABLE` e `CREATE VIEW`.

---

## 📝 Próximos Passos

Após a migração:

1. Reinicie o servidor backend (`npm run dev`)
2. Recarregue o frontend
3. Acesse "Configurações" no Inbox
4. Crie sua primeira etiqueta!
5. Teste os filtros clicando nas etiquetas na sidebar

---

## 📞 Suporte

Se encontrar problemas:
- Verifique os logs do backend para detalhes do erro
- Confirme que a migração foi executada com sucesso
- Verifique se o servidor está rodando na porta correta

**Migration ID**: `011_conversation_tags`  
**Data de Criação**: Fevereiro 2026  
**Autor**: Sistema LeadsFlow
