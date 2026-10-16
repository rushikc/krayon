import { getAnalytics, isSupported } from 'firebase/analytics'
import { getApps, initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'

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
