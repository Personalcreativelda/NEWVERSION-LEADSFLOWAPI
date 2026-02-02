export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
  avatar_url?: string | null;
  email_verified?: boolean;
}

export interface PaginatedQuery {
  limit?: number;
  offset?: number;
}
