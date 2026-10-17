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

export const appCheck = initializeAppCheck(firebaseApp, {
  provider: new ReCaptchaEnterpriseProvider(
    import.meta.env.VITE_RECAPTCHA_SITE_KEY || 'debug-placeholder-site-key',
  ),
  isTokenAutoRefreshEnabled: true,
})

void isSupported().then((supported) => {
  if (supported) getAnalytics(firebaseApp)
})

export const auth = getAuth(firebaseApp)

/** Local dev has no Firebase user. GCP uses anonymous auth. */
export const currentUid = () => (isGcpBackend ? (auth.currentUser?.uid ?? '') : 'local-user')

export const idToken = async () => {
  const user = auth.currentUser
  if (!isGcpBackend || !user) return ''
  return user.getIdToken()
}

export const appCheckToken = async () => {
  if (!isGcpBackend) return ''
  const result = await getToken(appCheck, false)
  return result.token
}

if (isGcpBackend) {
  onAuthStateChanged(auth, (user) => {
    if (!user) void signInAnonymously(auth)
  })
  onIdTokenChanged(auth, (user) => {
    if (!user) {
      setRenderToken('')
      return
    }
    void user.getIdToken().then((token) => setRenderToken(token))
  })
}
