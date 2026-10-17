import type { AuthProvider, AuthUser } from '@krayon/shared';

export const auth: AuthProvider = {
  currentUser(header): AuthUser {
    const raw = Array.isArray(header) ? header[0] : header;
    const uid = raw?.trim() || 'local-user';
    return { uid, email: `${uid}@localhost` };
  },
};
