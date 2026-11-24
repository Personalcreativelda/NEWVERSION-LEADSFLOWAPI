// Comentários do Facebook e do Instagram.
//
// Facebook: funciona com as permissões já aprovadas (pages_read_engagement, pages_manage_metadata,
// pages_messaging). Os comentários das páginas entram na caixa de entrada e a resposta é privada.
// META_FACEBOOK_COMMENTS=false desliga.
//
// Instagram e respostas públicas: precisam da revisão da Meta (instagram_business_manage_comments,
// pages_manage_engagement, pages_read_user_content). Até serem aprovadas, META_COMMENTS_ENABLED
// fica desligado e o login pede o mesmo de sempre.
export function facebookCommentsEnabled(): boolean {
  return process.env.META_FACEBOOK_COMMENTS !== 'false';
}

/** Instagram e respostas públicas (depois da revisão da Meta) */
export function commentsEnabled(): boolean {
  return process.env.META_COMMENTS_ENABLED === 'true';
}

/** Permissões extra do login do Facebook */
export function facebookCommentScopes(instagramViaFacebook: boolean): string[] {
  return [
    ...(facebookCommentsEnabled() ? ['pages_read_engagement'] : []), // ler os comentários da página (webhook "feed")
    ...(commentsEnabled()
      ? ['pages_manage_engagement', 'pages_read_user_content', ...(instagramViaFacebook ? ['instagram_manage_comments'] : [])]
      : []),
  ];
}

/** Permissão extra do login próprio do Instagram */
export function instagramCommentScopes(): string[] {
  return commentsEnabled() ? ['instagram_business_manage_comments'] : [];
}

/** Campos extra dos webhooks: "feed" na página do Facebook, "comments" na conta do Instagram */
export const facebookCommentFields = (): string[] => (facebookCommentsEnabled() ? ['feed'] : []);
export const instagramCommentFields = (): string[] => (commentsEnabled() ? ['comments'] : []);
