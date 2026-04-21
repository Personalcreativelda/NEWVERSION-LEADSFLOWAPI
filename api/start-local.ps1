# ============================================================
# start-local.ps1
# Inicia a API com suporte a proxy via HTTP CONNECT tunnel
# ============================================================

$PROXY_KEY = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$proxySettings = Get-ItemProperty -Path $PROXY_KEY -ErrorAction SilentlyContinue

# Detectar proxy automaticamente das configurações do Windows
if ($proxySettings.ProxyEnable -eq 1 -and $proxySettings.ProxyServer) {
    $proxyServer = $proxySettings.ProxyServer
    # Garantir que tem o schema http://
    if ($proxyServer -notmatch '^http') {
        $proxyServer = "http://$proxyServer"
    }
    $env:HTTP_PROXY  = $proxyServer
    $env:http_proxy  = $proxyServer
    $env:HTTPS_PROXY = $proxyServer
    $env:https_proxy = $proxyServer
    Write-Host "[Proxy] Detectado: $proxyServer" -ForegroundColor Cyan
    Write-Host "[Proxy] A API criará um bridge local para o banco de dados" -ForegroundColor Cyan
} else {
    Write-Host "[Proxy] Nenhum proxy detectado, conexão direta." -ForegroundColor Green
}

$env:NO_PROXY = "localhost,127.0.0.1,::1"
$env:no_proxy = "localhost,127.0.0.1,::1"

Write-Host "[API] Iniciando servidor..." -ForegroundColor Green
Write-Host "[API] Pressione Ctrl+C para parar" -ForegroundColor Yellow

Set-Location -Path $PSScriptRoot
npm run dev
