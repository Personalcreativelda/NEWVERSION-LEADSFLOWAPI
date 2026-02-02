#!/bin/bash

# 🔍 LeadsFlow API - Backend Health Check
# Este script verifica o status do backend e ajuda a diagnosticar problemas

set -e

echo "════════════════════════════════════════════════════════════════"
echo "🔍 LeadsFlow API - Diagnóstico do Backend"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Verificar se Supabase CLI está instalado
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI não encontrado!"
    echo ""
    echo "🔧 Como instalar:"
    echo "   npm install -g supabase"
    echo ""
    exit 1
fi

echo "✅ Supabase CLI instalado"
echo ""

# Verificar se projeto está linkado
echo "📋 Verificando projeto linkado..."
if supabase status &> /dev/null; then
    echo "✅ Projeto linkado com sucesso"
    supabase status
else
    echo "❌ Projeto não está linkado ou não está configurado"
    echo ""
    echo "🔧 Execute:"
    echo "   supabase link --project-ref <SEU_PROJECT_ID>"
    echo ""
    exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📡 Testando conectividade com o backend..."
echo "════════════════════════════════════════════════════════════════"
echo ""

# Ler PROJECT_ID e PUBLIC_ANON_KEY do arquivo de info
PROJECT_ID=$(grep "projectId = " utils/supabase/info.tsx | cut -d'"' -f2)
PUBLIC_ANON_KEY=$(grep "publicAnonKey = " utils/supabase/info.tsx | cut -d'"' -f2)

if [ -z "$PROJECT_ID" ] || [ -z "$PUBLIC_ANON_KEY" ]; then
    echo "❌ Não foi possível ler PROJECT_ID ou PUBLIC_ANON_KEY"
    echo "   Verifique o arquivo utils/supabase/info.tsx"
    exit 1
fi

echo "🔑 Project ID: $PROJECT_ID"
echo "🔑 Public Anon Key: ${PUBLIC_ANON_KEY:0:20}..."
echo ""

# Testar endpoint de health
BACKEND_URL="https://${PROJECT_ID}.supabase.co/functions/v1/make-server-4be966ab"

echo "🌐 Testando endpoint: ${BACKEND_URL}/health"
echo ""

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${PUBLIC_ANON_KEY}" \
    "${BACKEND_URL}/health" || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Backend ONLINE e respondendo!"
    echo "   Status Code: $HTTP_CODE"
elif [ "$HTTP_CODE" = "404" ]; then
    echo "⚠️  Backend respondeu com 404 - Função pode não estar deployada"
    echo "   Status Code: $HTTP_CODE"
    echo ""
    echo "🔧 Solução: Execute o deploy"
    echo "   ./deploy-backend.sh"
elif [ "$HTTP_CODE" = "000" ]; then
    echo "❌ Backend OFFLINE - Não foi possível conectar"
    echo "   Possíveis causas:"
    echo "   1. Função não está deployada"
    echo "   2. Projeto Supabase suspenso"
    echo "   3. Problema de rede/firewall"
    echo ""
    echo "🔧 Solução: Execute o deploy"
    echo "   ./deploy-backend.sh"
else
    echo "⚠️  Backend respondeu com código inesperado"
    echo "   Status Code: $HTTP_CODE"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📋 Listando Edge Functions deployadas..."
echo "════════════════════════════════════════════════════════════════"
echo ""

# Listar funções
if supabase functions list 2>/dev/null; then
    echo ""
    echo "✅ Comandos executados com sucesso"
else
    echo "⚠️  Não foi possível listar funções"
    echo "   Você pode precisar fazer login novamente:"
    echo "   supabase login"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📝 Logs recentes da função (últimos 20)..."
echo "════════════════════════════════════════════════════════════════"
echo ""

# Mostrar logs recentes
if supabase functions logs make-server-4be966ab --limit 20 2>/dev/null; then
    echo ""
    echo "✅ Logs carregados"
else
    echo "⚠️  Não foi possível carregar logs"
    echo "   A função pode não estar deployada"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📌 RESUMO DO DIAGNÓSTICO"
echo "════════════════════════════════════════════════════════════════"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Backend está ONLINE e funcionando"
    echo ""
    echo "🎉 Próximos passos:"
    echo "   1. Recarregue a página do LeadsFlow"
    echo "   2. Tente realizar operações normalmente"
    echo ""
elif [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "000" ]; then
    echo "❌ Backend está OFFLINE ou não deployado"
    echo ""
    echo "🔧 Para resolver:"
    echo "   1. Execute: ./deploy-backend.sh"
    echo "   2. Aguarde o deploy completar"
    echo "   3. Execute este script novamente: ./check-backend.sh"
    echo "   4. Recarregue a página do LeadsFlow"
    echo ""
else
    echo "⚠️  Status do backend incerto (HTTP $HTTP_CODE)"
    echo ""
    echo "🔧 Tente:"
    echo "   1. Execute: ./deploy-backend.sh"
    echo "   2. Verifique os logs: supabase functions logs make-server-4be966ab"
    echo ""
fi

echo "════════════════════════════════════════════════════════════════"
