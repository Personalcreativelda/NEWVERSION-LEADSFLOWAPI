#!/bin/bash

# 🚀 LeadsFlow API - Deploy Script
# Este script faz deploy da Edge Function para o Supabase

set -e

echo "=================================================="
echo "🚀 LeadsFlow API - Deploy do Backend"
echo "=================================================="
echo ""

# Verificar se Supabase CLI está instalado
if ! command -v supabase &> /dev/null
then
    echo "❌ Supabase CLI não encontrado!"
    echo ""
    echo "📦 Instalando Supabase CLI..."
    echo ""
    
    # Detectar sistema operacional
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        echo "🍎 Detectado macOS - Instalando via Homebrew..."
        brew install supabase/tap/supabase
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        echo "🐧 Detectado Linux - Instalando via NPM..."
        npm install -g supabase
    else
        echo "❌ Sistema operacional não suportado automaticamente"
        echo "Por favor, instale manualmente: https://supabase.com/docs/guides/cli"
        exit 1
    fi
fi

echo "✅ Supabase CLI encontrado!"
echo ""

# Verificar se está logado
echo "🔐 Verificando autenticação no Supabase..."
if ! supabase projects list &> /dev/null; then
    echo "❌ Você não está logado no Supabase!"
    echo ""
    echo "Por favor, faça login:"
    supabase login
fi

echo "✅ Autenticado no Supabase!"
echo ""

# Link do projeto
PROJECT_ID="rfzmpkdtasgwkopiboya"
echo "🔗 Linkando projeto: $PROJECT_ID"

if ! supabase link --project-ref $PROJECT_ID; then
    echo ""
    echo "⚠️  Erro ao linkar projeto. Você já pode estar linkado."
    echo "Continuando com o deploy..."
fi

echo ""
echo "📦 Fazendo deploy da Edge Function 'make-server-4be966ab'..."
echo ""

# Deploy da função
cd supabase/functions
supabase functions deploy make-server-4be966ab \
  --project-ref $PROJECT_ID \
  --no-verify-jwt

echo ""
echo "=================================================="
echo "✅ DEPLOY CONCLUÍDO COM SUCESSO!"
echo "=================================================="
echo ""
echo "🌐 URL da Edge Function:"
echo "https://$PROJECT_ID.supabase.co/functions/v1/make-server-4be966ab"
echo ""
echo "🔍 Para testar o health check:"
echo "curl https://$PROJECT_ID.supabase.co/functions/v1/make-server-4be966ab/health"
echo ""
echo "📊 Para ver logs em tempo real:"
echo "supabase functions logs make-server-4be966ab"
echo ""
echo "=================================================="
