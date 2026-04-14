@echo off
REM ═════════════════════════════════════════════════════════════════════════════
REM 🧹 Script para executar limpeza de números telefônicos no PostgreSQL
REM ═════════════════════════════════════════════════════════════════════════════

REM Variáveis de conexão (do .env)
SET PG_HOST=168.231.104.15
SET PG_PORT=5433
SET PG_USER=postgres
SET PG_PASSWORD=Mam11Me8DUEnp6Quq8N5c9msIBVH9ZCCeK7aZt0Ga6azkdKGvwzKJrCxtl6Hh6a6
SET PG_DATABASE=postgres

echo.
echo  🚀 Iniciando limpeza de números telefônicos...
echo.

REM Executar o script SQL
psql -h %PG_HOST% -p %PG_PORT% -U %PG_USER% -d %PG_DATABASE% -f cleanup-phone-numbers.sql

if %ERRORLEVEL% EQU 0 (
    echo.
    echo  ✅ Limpeza concluída com sucesso!
    echo.
) else (
    echo.
    echo  ❌ Erro durante a limpeza!
    echo.
)

pause
