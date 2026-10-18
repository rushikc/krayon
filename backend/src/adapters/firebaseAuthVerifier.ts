import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth } from 'firebase-admin/auth';
import type { AuthUser, AuthVerifier, RequestCtx } from '@krayon/shared';

const header = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

const httpError = (status: number, detail: string) => Object.assign(new Error(detail), { statusCode: status });

/**
 * Bearer ID tokens on every route. `?token=` is accepted only for keyframe images.
 * App Check is required except on that route, unless APP_CHECK_ENFORCE=false.
 */
export const createFirebaseAuthVerifier = (): AuthVerifier => ({
  async verify(req: RequestCtx, opts): Promise<AuthUser> {
    const bearer = header(req.headers.authorization);
    const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
    const raw = bearer.startsWith('Bearer ') ? bearer.slice(7) : opts?.renders ? queryToken : '';
    if (!raw) throw httpError(401, 'Sign in required');
    const decoded = await getAuth().verifyIdToken(raw);
    if (process.env.APP_CHECK_ENFORCE === 'true' && !opts?.renders) {
      const check = header(req.headers['x-firebase-appcheck']);
      if (!check) throw httpError(401, 'App Check required');
      await getAppCheck().verifyToken(check);
    }
    return { uid: decoded.uid, email: decoded.email };
  },
});
