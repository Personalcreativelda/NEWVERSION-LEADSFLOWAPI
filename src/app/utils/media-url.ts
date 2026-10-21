// Endereços de imagens vindos de fora (WhatsApp, Instagram, storage) que o browser
// não consegue carregar — evitar o pedido em vez de deixar o erro na consola.

/**
 * Fotos de perfil do WhatsApp/Facebook/Instagram vêm dos CDNs da Meta com validade no
 * parâmetro `oe` (timestamp unix em hexadecimal); depois disso o CDN responde 403.
 * Devolve null para esses endereços já expirados, para se mostrar o fallback (iniciais).
 */
export function usableImageUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const oe = new URL(url).searchParams.get('oe');
    if (oe && /^[0-9a-f]{6,}$/i.test(oe) && parseInt(oe, 16) * 1000 < Date.now()) return null;
  } catch {
    // URL relativa ou data: — usar como está
  }
  return url;
}

/**
 * Endereço de um host interno do servidor (ex.: http://minio:9000/..., localhost ou IP
 * privado) — só acessível através do proxy de média da API.
 */
export function isInternalMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return (
      !hostname.includes('.') ||
      hostname === 'localhost' ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
  } catch {
    return false;
  }
}
