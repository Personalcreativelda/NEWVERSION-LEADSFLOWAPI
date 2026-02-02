export interface PostgresError extends Error {
  code?: string;
  detail?: string;
  hint?: string;
}

export const isPostgresError = (error: unknown): error is PostgresError => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as Partial<PostgresError>;
  return typeof candidate.code === 'string' || typeof candidate.detail === 'string' || typeof candidate.hint === 'string';
};
