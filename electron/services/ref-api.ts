import {
  resolveFirebaseWebApiKey,
  refToolsCreateSession,
  firebaseSignInWithPassword
} from './ref-credits'
import {
  describeFetchError,
  NETWORK_RETRY_HINT,
  userFacingNetworkMessage
} from '../utils/describe-fetch-error'

const IDENTITY_TOOLKIT_V1 = 'https://identitytoolkit.googleapis.com/v1' as const
const REF_CLOUD_FUNCTIONS = 'https://us-central1-prod-ref.cloudfunctions.net' as const

type FirebaseHttpErrorBody = { error?: { message?: string } }

export type RefApiLogType = 'info' | 'success' | 'warning' | 'error'

export interface RefApiRegistrationResult {
  success: boolean
  idToken?: string
  localId?: string
  refreshToken?: string
  apiKey?: string
  error?: string
  /** 邮箱已在 Firebase 验证过，无需再走邮件链接流程 */
  skipVerificationFlow?: boolean
}

export interface RefApiCompleteVerificationResult {
  success: boolean
  apiKey?: string
  error?: string
}

function isCallableError(x: unknown): x is { error: string } {
  return (
    typeof x === 'object' &&
    x !== null &&
    'error' in x &&
    typeof (x as { error: unknown }).error === 'string'
  )
}

function firebaseErrorMessage(data: FirebaseHttpErrorBody, status: number): string {
  return data.error?.message ?? `Firebase HTTP ${status}`
}

function isFirebaseEmailAlreadyRegistered(message: string): boolean {
  const u = message.toUpperCase()
  return (
    u.includes('EMAIL_EXISTS') ||
    u.includes('EMAIL_ALREADY_EXISTS') ||
    /already in use by another account/i.test(message)
  )
}

export async function firebaseSignUp(
  apiKey: string,
  email: string,
  password: string
): Promise<
  { idToken: string; localId: string; refreshToken: string } | { error: string }
> {
  const url = `${IDENTITY_TOOLKIT_V1}/accounts:signUp?key=${encodeURIComponent(apiKey)}`
  let r: Response
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    })
  } catch (e) {
    return { error: describeFetchError(e, 'accounts:signUp') }
  }
  const data = (await r.json().catch(() => ({}))) as FirebaseHttpErrorBody & {
    idToken?: string
    localId?: string
    refreshToken?: string
  }
  if (data.idToken && data.localId && data.refreshToken) {
    return {
      idToken: data.idToken,
      localId: data.localId,
      refreshToken: data.refreshToken
    }
  }
  return { error: firebaseErrorMessage(data, r.status) }
}

export async function firebaseSendVerificationEmail(
  apiKey: string,
  idToken: string
): Promise<{ success: true } | { error: string }> {
  const url = `${IDENTITY_TOOLKIT_V1}/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType: 'VERIFY_EMAIL' as const, idToken })
  })
  const data = (await r.json().catch(() => ({}))) as FirebaseHttpErrorBody
  if (!r.ok) return { error: firebaseErrorMessage(data, r.status) }
  if (data.error?.message) return { error: data.error.message }
  return { success: true }
}

export async function firebaseApplyOobCode(
  apiKey: string,
  oobCode: string
): Promise<
  | { emailVerified: boolean; localId: string; idToken?: string }
  | { error: string }
> {
  const url = `${IDENTITY_TOOLKIT_V1}/accounts:update?key=${encodeURIComponent(apiKey)}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode })
  })
  const data = (await r.json().catch(() => ({}))) as FirebaseHttpErrorBody & {
    emailVerified?: boolean
    localId?: string
    idToken?: string
  }
  if (data.localId == null) {
    return { error: firebaseErrorMessage(data, r.status) }
  }
  const emailVerified =
    typeof data.emailVerified === 'boolean' ? data.emailVerified : true
  return {
    emailVerified,
    localId: data.localId,
    ...(data.idToken != null ? { idToken: data.idToken } : {})
  }
}

export async function firebaseLookup(
  apiKey: string,
  idToken: string
): Promise<{ emailVerified: boolean; localId: string } | { error: string }> {
  const url = `${IDENTITY_TOOLKIT_V1}/accounts:lookup?key=${encodeURIComponent(apiKey)}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  })
  const data = (await r.json().catch(() => ({}))) as FirebaseHttpErrorBody & {
    users?: Array<{ localId?: string; emailVerified?: boolean }>
  }
  const u = data.users?.[0]
  if (u?.localId != null && typeof u.emailVerified === 'boolean') {
    return { emailVerified: u.emailVerified, localId: u.localId }
  }
  return { error: firebaseErrorMessage(data, r.status) }
}

type CallableResponse<T> = { result?: T; error?: { message?: string; status?: string } }

export async function callRefCallable<T = unknown>(
  functionName: string,
  data: Record<string, unknown>,
  idToken: string
): Promise<T | { error: string }> {
  const url = `${REF_CLOUD_FUNCTIONS}/${encodeURIComponent(functionName)}`
  let r: Response
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify({ data: { ...data } })
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '网络错误'
    return { error: message }
  }
  const json = (await r.json().catch(() => null)) as CallableResponse<T> | null
  if (json?.error?.message) {
    return { error: json.error.message }
  }
  if (!r.ok) {
    return { error: json?.error?.message ?? `HTTP ${r.status}` }
  }
  if (json && 'result' in json) {
    return json.result as T
  }
  return { error: '无效响应' }
}

export async function createRefApiKey(
  idToken: string,
  name?: string
): Promise<{ apiKey: string; name: string } | { error: string }> {
  const keyName = name ?? 'default'
  const raw = await callRefCallable<{ key?: string; apiKey?: string; name?: string }>(
    'createApiKeyCallableV2',
    { name: keyName },
    idToken
  )
  if (isCallableError(raw)) return raw
  const secret =
    typeof raw?.key === 'string' && raw.key.length > 0
      ? raw.key
      : typeof raw?.apiKey === 'string' && raw.apiKey.length > 0
        ? raw.apiKey
        : undefined
  if (secret != null) {
    return {
      apiKey: secret,
      name: typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : keyName
    }
  }
  return { error: '缺少 apiKey' }
}

export async function notifyEmailVerified(
  idToken: string
): Promise<{ success: true } | { error: string }> {
  const raw = await callRefCallable<unknown>('onEmailVerified', {}, idToken)
  if (isCallableError(raw)) return raw
  return { success: true }
}

export async function updateMarketingConsent(
  idToken: string,
  marketingConsent: boolean
): Promise<{ success: true } | { error: string }> {
  const raw = await callRefCallable<unknown>(
    'updateMarketingConsent',
    { marketingConsent },
    idToken
  )
  if (isCallableError(raw)) return raw
  return { success: true }
}

const OOB_CODE_PARAM_RE = /[?&]oobCode=([^&"'<>\s]+)/i

function decodeOobParam(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function isInvalidOobCodeError(message: string): boolean {
  const u = message.toUpperCase()
  return u.includes('INVALID_OOB_CODE') || u.includes('EXPIRED_OOB_CODE')
}

export function extractOobCodeFromLink(verificationLink: string): string | null {
  const s = verificationLink.trim()
  if (!s) return null

  let fromUrl: string | null = null
  try {
    const u = new URL(s)
    const code = u.searchParams.get('oobCode')
    if (code != null && code.length > 0) fromUrl = code
  } catch {
    fromUrl = null
  }

  if (fromUrl != null && fromUrl.length > 0) return fromUrl

  const m = s.match(OOB_CODE_PARAM_RE)
  if (!m?.[1]) return null
  const decoded = decodeOobParam(m[1])
  return decoded.length > 0 ? decoded : null
}

export async function refApiRegisterFull(
  email: string,
  password: string,
  onLog?: (type: RefApiLogType, message: string) => void
): Promise<RefApiRegistrationResult> {
  const emit = (type: RefApiLogType, message: string) => {
    onLog?.(type, message)
  }
  try {
    const webApiKey = await resolveFirebaseWebApiKey()
    const signUp = await firebaseSignUp(webApiKey, email, password)
    if ('error' in signUp) {
      if (!isFirebaseEmailAlreadyRegistered(signUp.error)) {
        const errOut = userFacingNetworkMessage(signUp.error)
        emit('error', errOut)
        return { success: false, error: errOut }
      }
      const signIn = await firebaseSignInWithPassword(webApiKey, email, password)
      if ('error' in signIn) {
        const errOut = userFacingNetworkMessage(signIn.error)
        emit('error', errOut)
        return { success: false, error: errOut }
      }
      const sessExisting = await refToolsCreateSession(signIn.idToken)
      if ('error' in sessExisting) {
        const errOut = userFacingNetworkMessage(sessExisting.error)
        emit('error', errOut)
        return { success: false, error: errOut }
      }
      const consentExisting = await updateMarketingConsent(signIn.idToken, true)
      if ('error' in consentExisting) {
        emit('warning', userFacingNetworkMessage(consentExisting.error))
      }
      const lookup = await firebaseLookup(webApiKey, signIn.idToken)
      if ('error' in lookup) {
        const errOut = userFacingNetworkMessage(lookup.error)
        emit('error', errOut)
        return { success: false, error: errOut }
      }
      if (lookup.emailVerified) {
        emit('success', '邮箱已验证，跳过邮件验证')
        return {
          success: true,
          idToken: signIn.idToken,
          localId: signIn.localId,
          skipVerificationFlow: true
        }
      }
      const sentExisting = await firebaseSendVerificationEmail(webApiKey, signIn.idToken)
      if ('error' in sentExisting) {
        const errOut = userFacingNetworkMessage(sentExisting.error)
        emit('error', errOut)
        return { success: false, error: errOut }
      }
      emit('success', '验证邮件已发送')
      return {
        success: true,
        idToken: signIn.idToken,
        localId: signIn.localId,
        skipVerificationFlow: false
      }
    }
    const sess = await refToolsCreateSession(signUp.idToken)
    if ('error' in sess) {
      const errOut = userFacingNetworkMessage(sess.error)
      emit('error', errOut)
      return { success: false, error: errOut }
    }
    const consent = await updateMarketingConsent(signUp.idToken, true)
    if ('error' in consent) {
      const errOut = userFacingNetworkMessage(consent.error)
      emit('error', errOut)
      return { success: false, error: errOut }
    }
    const sent = await firebaseSendVerificationEmail(webApiKey, signUp.idToken)
    if ('error' in sent) {
      const errOut = userFacingNetworkMessage(sent.error)
      emit('error', errOut)
      return { success: false, error: errOut }
    }
    emit('success', '验证邮件已发送')
    return {
      success: true,
      idToken: signUp.idToken,
      localId: signUp.localId,
      refreshToken: signUp.refreshToken
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '未知错误'
    const errOut = /fetch failed/i.test(message) ? NETWORK_RETRY_HINT : message
    emit('error', errOut)
    return { success: false, error: errOut }
  }
}

export async function refApiCompleteVerification(
  apiKey: string,
  oobCode: string,
  idToken: string
): Promise<RefApiCompleteVerificationResult> {
  const applied = await firebaseApplyOobCode(apiKey, oobCode)
  if ('error' in applied) {
    return { success: false, error: applied.error }
  }
  const newIdToken = applied.idToken ?? idToken
  const notified = await notifyEmailVerified(newIdToken)
  if ('error' in notified) {
    return { success: false, error: notified.error }
  }
  const created = await createRefApiKey(newIdToken)
  if ('error' in created) {
    return { success: false, error: created.error }
  }
  return { success: true, apiKey: created.apiKey }
}
