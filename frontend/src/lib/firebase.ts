import { getAnalytics, isSupported } from 'firebase/analytics'
import { getApps, initializeApp } from 'firebase/app'
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { getAuth, onAuthStateChanged, onIdTokenChanged, signInAnonymously } from 'firebase/auth'
import { setRenderToken } from './api.ts'

export const isGcpBackend = import.meta.env.VITE_BACKEND === 'gcp'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig)

// App Check is enforced for AI Logic, so every AI call needs a token.
// On localhost, a debug token is used (registered in Firebase console > App Check > Manage debug tokens).
if (import.meta.env.DEV) {
  ;(self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
    import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true
}

const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
if (!siteKey) console.warn('App Check skipped: VITE_RECAPTCHA_SITE_KEY is not set.')

export const appCheck = siteKey
  ? initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    })
  : null

void isSupported().then((supported) => {
  if (supported) getAnalytics(firebaseApp)
})

export const auth = getAuth(firebaseApp)

/** Local dev has no Firebase user. GCP uses anonymous auth. */
export const currentUid = () => (isGcpBackend ? (auth.currentUser?.uid ?? '') : 'local-user')

let signingIn: Promise<void> | null = null

/** Waits for the saved session, or signs in anonymously once. Shared by all callers. */
const ensureSignedIn = (): Promise<void> => {
  if (auth.currentUser) return Promise.resolve()
  signingIn ??= auth
    .authStateReady()
    .then(async () => {
      if (!auth.currentUser) await signInAnonymously(auth)
    })
    .finally(() => {
      signingIn = null
    })
  return signingIn
}

export const idToken = async () => {
  if (!isGcpBackend) return ''
  try {
    await ensureSignedIn()
  } catch {
    return ''
  }
  const user = auth.currentUser
  return user ? user.getIdToken() : ''
}

export const appCheckToken = async () => {
  if (!isGcpBackend || !appCheck) return ''
  const result = await getToken(appCheck, false)
  return result.token
}

const connectListeners = new Set<(failed: boolean) => void>()

/** GCP anonymous sign-in failed. The UI shows a retry, never a login form. */
export const watchConnect = (listener: (failed: boolean) => void) => {
  connectListeners.add(listener)
  return () => {
    connectListeners.delete(listener)
  }
}

export const retryConnect = () => {
  if (!isGcpBackend) return
  void ensureSignedIn()
    .then(() => {
      for (const listener of connectListeners) listener(false)
    })
    .catch(() => {
      for (const listener of connectListeners) listener(true)
    })
}

if (isGcpBackend) {
  onAuthStateChanged(auth, (user) => {
    if (!user) retryConnect()
  })
  onIdTokenChanged(auth, (user) => {
    if (!user) {
      setRenderToken('')
      return
    }
    void user.getIdToken().then((token) => setRenderToken(token))
  })
}
