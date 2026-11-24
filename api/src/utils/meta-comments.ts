// Comentário → mensagem privada. As permissões de comentários precisam da revisão da Meta:
// enquanto não forem aprovadas, META_COMMENTS_ENABLED fica desligado e o login pede o mesmo de sempre.
export function commentsEnabled(): boolean {
  return process.env.META_COMMENTS_ENABLED === 'true';
}

/** Permissões extra do login do Facebook (comentários da página e, pelo Facebook, do Instagram) */
export function facebookCommentScopes(instagramViaFacebook: boolean): string[] {
  if (!commentsEnabled()) return [];
  return [
    'pages_read_engagement',   // ler os comentários da página (webhook "feed")
    'pages_manage_engagement', // responder em público ao comentário
    ...(instagramViaFacebook ? ['instagram_manage_comments'] : []),
  ];
}

/** Permissão extra do login próprio do Instagram */
export function instagramCommentScopes(): string[] {
  return commentsEnabled() ? ['instagram_business_manage_comments'] : [];
}

/** Campos extra dos webhooks: "feed" na página do Facebook, "comments" na conta do Instagram */
export const facebookCommentFields = (): string[] => (commentsEnabled() ? ['feed'] : []);
export const instagramCommentFields = (): string[] => (commentsEnabled() ? ['comments'] : []);
