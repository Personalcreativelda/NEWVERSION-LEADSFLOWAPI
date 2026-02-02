const parseOrigins = () => {
  const raw = process.env.CORS_ORIGINS || '';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret || secret === 'change-me' || secret === 'change_me_in_production') {
    throw new Error(
      'JWT_SECRET is not configured or using default value. ' +
      'Set a strong JWT_SECRET environment variable before starting the server.'
    );
  }

  if (secret.length < 32) {
    console.warn(
      '[WARNING] JWT_SECRET is too short (< 32 characters). ' +
      'Use a longer secret for better security.'
    );
  }

  return secret;
};

export const config = {
  corsOrigins: parseOrigins(),
  jwtSecret: getJwtSecret(),
};
