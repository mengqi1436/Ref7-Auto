export const REF_ORIGIN = 'https://ref.tools'
const REF_LOGIN_URL = `${REF_ORIGIN}/login`
const REF_ACCOUNT_URL = `${REF_ORIGIN}/account`
export const REF_API_SESSION = `${REF_ORIGIN}/api/auth/session`
export const REF_API_TOKEN = `${REF_ORIGIN}/api/auth/token`

export const REF_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Origin: REF_ORIGIN,
  Referer: REF_LOGIN_URL
} as const

const FIREBASE_KEY_REGEX = /AIza[0-9A-Za-z_-]{35}/

export const REF_DEFAULT_FIREBASE_WEB_API_KEY = 'AIzaSyAk9Mg_VQkMzmA37LfZOgsolxcaNV_FpV4'

export const FIRESTORE_USER_DOC = (localId: string) =>
  `https://firestore.googleapis.com/v1/projects/prod-ref/databases/(default)/documents/users/${encodeURIComponent(localId)}`

let cachedFirebaseWebApiKey: string | null = null

const IDENTITY_LOOKUP = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup'
const IDENTITY_SEND_OOB = 'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode'

export interface RefSessionEntry {
  cookie: string
  localId: string
  idToken: string
  emailVerified?: boolean | null
}

const sessionByEmail = new Map<string, RefSessionEntry>()

export interface RefRegistrationData {
  email: string
  password: string
}

export interface RefCreditsResult {
  credits: number | null
  emailVerified?: boolean | null
  error?: string
}

async function lookupEmailVerified(apiKey: string, idToken: string): Promise<boolean | null> {
  try {
    const url = `${IDENTITY_LOOKUP}?key=${encodeURIComponent(apiKey)}`
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    })
    const data = (await r.json().catch(() => ({}))) as {
      users?: Array<{ emailVerified?: boolean }>
    }
    const u = data.users?.[0]
    if (typeof u?.emailVerified === 'boolean') return u.emailVerified
  } catch {}
  return null
}

async function firebaseSendVerificationEmailLocal(
  apiKey: string,
  idToken: string
): Promise<{ success: true } | { error: string }> {
  const url = `${IDENTITY_SEND_OOB}?key=${encodeURIComponent(apiKey)}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType: 'VERIFY_EMAIL' as const, idToken })
  })
  const data = (await r.json().catch(() => ({}))) as { error?: { message?: string } }
  if (!r.ok) return { error: data.error?.message ?? `Firebase HTTP ${r.status}` }
  if (data.error?.message) return { error: data.error.message }
  return { success: true }
}

export async function resendRefVerificationEmail(
  data: RefRegistrationData
): Promise<{ success: true } | { error: string }> {
  const apiKey = await resolveFirebaseWebApiKey()
  const signIn = await firebaseSignInWithPassword(apiKey, data.email, data.password)
  if ('error' in signIn) return { error: signIn.error }
  return firebaseSendVerificationEmailLocal(apiKey, signIn.idToken)
}

function getSetCookieLines(headers: Headers): string[] {
  const h = headers as Headers & { getSetCookie?: () => string[] }
  if (typeof h.getSetCookie === 'function') return h.getSetCookie()
  const single = headers.get('set-cookie')
  return single ? [single] : []
}

function parseSessionValueFromSetCookie(headers: Headers): string | null {
  for (const line of getSetCookieLines(headers)) {
    if (!line.startsWith('__session=')) continue
    const valuePart = line.split(';')[0]
    const eq = valuePart.indexOf('=')
    if (eq < 0) continue
    return valuePart.slice(eq + 1).trim()
  }
  return null
}

function collectAssetJsUrls(html: string): string[] {
  const urls: string[] = []
  for (const m of html.matchAll(/src=["'](\/assets\/[^"']+\.js)["']/gi)) {
    urls.push(`${REF_ORIGIN}${m[1]}`)
  }
  return [...new Set(urls)]
}

async function findFirebaseKeyInBundles(html: string): Promise<string | null> {
  for (const url of collectAssetJsUrls(html).slice(0, 24)) {
    try {
      const r = await fetch(url, { headers: { ...REF_FETCH_HEADERS } })
      const t = await r.text()
      const m = t.match(FIREBASE_KEY_REGEX)
      if (m) return m[0]
    } catch {}
  }
  return null
}

export async function resolveFirebaseWebApiKey(): Promise<string> {
  if (cachedFirebaseWebApiKey) return cachedFirebaseWebApiKey
  const fromEnv = process.env.REF7_REF_FIREBASE_WEB_API_KEY?.trim()
  if (fromEnv) {
    cachedFirebaseWebApiKey = fromEnv
    return fromEnv
  }
  try {
    const r = await fetch(REF_LOGIN_URL, { headers: { ...REF_FETCH_HEADERS } })
    const html = await r.text()
    const inline = html.match(FIREBASE_KEY_REGEX)
    if (inline) {
      cachedFirebaseWebApiKey = inline[0]
      return inline[0]
    }
    const fromBundle = await findFirebaseKeyInBundles(html)
    if (fromBundle) {
      cachedFirebaseWebApiKey = fromBundle
      return fromBundle
    }
  } catch {}
  cachedFirebaseWebApiKey = REF_DEFAULT_FIREBASE_WEB_API_KEY
  return REF_DEFAULT_FIREBASE_WEB_API_KEY
}

export async function firebaseSignInWithPassword(
  apiKey: string,
  email: string,
  password: string
): Promise<{ idToken: string; localId: string } | { error: string }> {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true
    })
  })
  const data = (await r.json()) as {
    idToken?: string
    localId?: string
    error?: { message: string }
  }
  if (data.idToken && data.localId) return { idToken: data.idToken, localId: data.localId }
  const msg = data.error?.message || `Firebase HTTP ${r.status}`
  return { error: msg }
}

export async function refToolsCreateSession(idToken: string): Promise<{ cookie: string } | { error: string }> {
  const r = await fetch(REF_API_SESSION, {
    method: 'POST',
    headers: {
      ...REF_FETCH_HEADERS,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ idToken })
  })
  const sessionVal = parseSessionValueFromSetCookie(r.headers)
  if (!sessionVal) {
    const text = await r.text().catch(() => '')
    return { error: text.slice(0, 200) || `会话接口 HTTP ${r.status}` }
  }
  return { cookie: `__session=${sessionVal}` }
}

async function refSessionLooksValid(cookie: string): Promise<boolean> {
  const r = await fetch(REF_API_TOKEN, {
    headers: {
      ...REF_FETCH_HEADERS,
      Cookie: cookie,
      Accept: 'application/json'
    }
  })
  return r.ok
}

async function fetchCreditsFromFirestore(localId: string, idToken: string): Promise<number | null> {
  const r = await fetch(FIRESTORE_USER_DOC(localId), {
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json'
    }
  })
  if (!r.ok) return null
  const data = (await r.json()) as {
    fields?: { credits?: { integerValue?: string; doubleValue?: number } }
  }
  const c = data.fields?.credits
  if (c?.integerValue != null) return parseInt(String(c.integerValue), 10)
  if (typeof c?.doubleValue === 'number') return Math.round(c.doubleValue)
  return null
}

function parseAvailableCreditsFromHtml(html: string): number | null {
  const direct = html.match(/Available\s+Credits[\s\S]{0,200}?(\d{1,9})\b/i)
  if (direct) return parseInt(direct[1], 10)
  const lower = html.toLowerCase()
  const idx = lower.indexOf('available credits')
  if (idx < 0) return null
  const chunk = html.slice(idx, idx + 160)
  const m = chunk.match(/(\d{1,9})/)
  return m ? parseInt(m[1], 10) : null
}

function htmlSuggestsLoginPage(html: string, finalUrl: string): boolean {
  if (finalUrl.includes('/login')) return true
  return /sign\s*in\s*with\s*email/i.test(html) && !/available\s*credits/i.test(html)
}

async function fetchCreditsWithSessionCookie(cookie: string): Promise<
  { credits: number } | { error: string }
> {
  const r = await fetch(REF_ACCOUNT_URL, {
    headers: {
      ...REF_FETCH_HEADERS,
      Cookie: cookie,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    redirect: 'follow'
  })
  const text = await r.text()
  const finalUrl = r.url
  if (htmlSuggestsLoginPage(text, finalUrl)) {
    return { error: '会话已失效' }
  }
  const credits = parseAvailableCreditsFromHtml(text)
  if (credits === null) return { error: '未解析到 Available Credits' }
  return { credits }
}

async function establishSessionCookie(email: string, password: string): Promise<
  RefSessionEntry | { error: string }
> {
  const apiKey = await resolveFirebaseWebApiKey()
  const signIn = await firebaseSignInWithPassword(apiKey, email, password)
  if ('error' in signIn) return { error: `Firebase: ${signIn.error}` }

  const [sess, ev] = await Promise.all([
    refToolsCreateSession(signIn.idToken),
    lookupEmailVerified(apiKey, signIn.idToken)
  ])
  if ('error' in sess) return { error: sess.error }

  return {
    cookie: sess.cookie,
    localId: signIn.localId,
    idToken: signIn.idToken,
    emailVerified: ev
  }
}

async function resolveCredits(
  entry: RefSessionEntry
): Promise<{ credits: number } | { error: string }> {
  const fromFs = await fetchCreditsFromFirestore(entry.localId, entry.idToken)
  if (fromFs !== null) return { credits: fromFs }

  const htmlGot = await fetchCreditsWithSessionCookie(entry.cookie)
  if ('credits' in htmlGot) return htmlGot
  if (htmlGot.error === '会话已失效') return htmlGot

  return { error: '未解析到 Available Credits' }
}

export async function fetchRefAccountCredits(data: RefRegistrationData): Promise<RefCreditsResult> {
  const key = data.email.toLowerCase()

  try {
    let entry = sessionByEmail.get(key)

    if (entry && (await refSessionLooksValid(entry.cookie))) {
      const apiKey = await resolveFirebaseWebApiKey()
      const [got, ev] = await Promise.all([
        resolveCredits(entry),
        lookupEmailVerified(apiKey, entry.idToken)
      ])
      const next: RefSessionEntry = { ...entry, emailVerified: ev }
      sessionByEmail.set(key, next)
      if ('credits' in got) {
        return { credits: got.credits, emailVerified: ev }
      }
      sessionByEmail.delete(key)
    } else if (entry) {
      sessionByEmail.delete(key)
    }

    const established = await establishSessionCookie(data.email, data.password)
    if ('error' in established) {
      return { credits: null, emailVerified: null, error: established.error }
    }

    sessionByEmail.set(key, established)
    const got2 = await resolveCredits(established)
    const evOut = established.emailVerified ?? null
    if ('credits' in got2) {
      return { credits: got2.credits, emailVerified: evOut }
    }

    sessionByEmail.delete(key)
    return {
      credits: null,
      emailVerified: evOut,
      error: 'error' in got2 ? got2.error : '未解析到 Available Credits'
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    return { credits: null, emailVerified: null, error: message }
  }
}

export async function fetchAllRefCredits(
  accounts: { id: number; email: string; password: string }[]
): Promise<Record<number, RefCreditsResult>> {
  const entries = await Promise.all(
    accounts.map(async a => {
      const result = await fetchRefAccountCredits({ email: a.email, password: a.password })
      return [a.id, result] as const
    })
  )
  return Object.fromEntries(entries)
}
