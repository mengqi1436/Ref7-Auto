const CTX7_ORIGIN = 'https://context7.com'
const CTX7_DASHBOARD = `${CTX7_ORIGIN}/dashboard`
const CTX7_ACCOUNTS_ORIGIN = 'https://accounts.context7.com'
const CTX7_ACCOUNTS_SIGN_IN = `${CTX7_ACCOUNTS_ORIGIN}/sign-in`

const CLERK_FAPI_ORIGIN = 'https://clerk.context7.com/v1'

const CTX7_FETCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Origin: CTX7_ORIGIN,
  Referer: CTX7_DASHBOARD
}

const CLERK_FETCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Origin: CTX7_ACCOUNTS_ORIGIN,
  Referer: CTX7_ACCOUNTS_SIGN_IN
}

const DEFAULT_CLERK_API_VERSION = '2025-11-10'
const DEFAULT_CLERK_JS_VERSION = '5.125.7'

interface Ctx7Credentials {
  email: string
  password: string
}

export interface Context7RequestsResult {
  used: number | null
  limit: number | null
  error?: string
}

interface Ctx7SessionEntry {
  cookieHeader: string
  authorization?: string
}

const sessionByEmail = new Map<string, Ctx7SessionEntry>()

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : '未知错误')

function getSetCookieLines(headers: Headers): string[] {
  const h = headers as Headers & { getSetCookie?: () => string[] }
  if (typeof h.getSetCookie === 'function') return h.getSetCookie()
  const single = headers.get('set-cookie')
  return single ? [single] : []
}

function mergeSetCookieIntoJar(headers: Headers, jar: Map<string, string>): void {
  for (const line of getSetCookieLines(headers)) {
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const name = line.slice(0, eq).trim()
    const rest = line.slice(eq + 1)
    const semi = rest.indexOf(';')
    const value = (semi < 0 ? rest : rest.slice(0, semi)).trim()
    jar.set(name, value)
  }
}

function jarToCookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

function clerkQueryString(): string {
  const api =
    process.env.REF7_CTX7_CLERK_API_VERSION?.trim() || DEFAULT_CLERK_API_VERSION
  const js = process.env.REF7_CTX7_CLERK_JS_VERSION?.trim() || DEFAULT_CLERK_JS_VERSION
  return `__clerk_api_version=${encodeURIComponent(api)}&_clerk_js_version=${encodeURIComponent(js)}`
}

interface ClerkErrorItem {
  message?: string
  long_message?: string
  code?: string
}

interface ClerkSignInResponse {
  object?: string
  id?: string
  status?: string
  created_session_id?: string | null
}

interface ClerkWrapped {
  response?: ClerkSignInResponse
  errors?: ClerkErrorItem[]
}

function firstClerkError(w: ClerkWrapped): string | null {
  const e = w.errors?.[0]
  if (!e) return null
  return (e.long_message || e.message || '').trim() || null
}

function jarHasSessionCookie(jar: Map<string, string>): boolean {
  for (const k of jar.keys()) {
    if (k === '__session' || k.startsWith('__session_')) return true
  }
  return false
}

function extractJwtFromTokenPayload(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  if (typeof o.jwt === 'string' && o.jwt.length > 0) return o.jwt
  const resp = o.response
  if (resp && typeof resp === 'object') {
    const r = resp as Record<string, unknown>
    if (typeof r.jwt === 'string' && r.jwt.length > 0) return r.jwt
    const lat = r.last_active_token
    if (lat && typeof lat === 'object') {
      const j = (lat as Record<string, unknown>).jwt
      if (typeof j === 'string' && j.length > 0) return j
    }
    const tok = r.token
    if (tok && typeof tok === 'object') {
      const j2 = (tok as Record<string, unknown>).jwt
      if (typeof j2 === 'string' && j2.length > 0) return j2
    }
  }
  return null
}

function dashboardAuthHeaders(entry: Pick<Ctx7SessionEntry, 'cookieHeader' | 'authorization'>): Record<string, string> {
  const h: Record<string, string> = { ...CTX7_FETCH_HEADERS, Cookie: entry.cookieHeader }
  if (entry.authorization) h.Authorization = entry.authorization
  return h
}

async function clerkFetch(
  path: string,
  jar: Map<string, string>,
  init: RequestInit & { headers?: Record<string, string> }
): Promise<Response> {
  const url = `${CLERK_FAPI_ORIGIN}${path}?${clerkQueryString()}`
  const cookie = jarToCookieHeader(jar)
  const r = await fetch(url, {
    ...init,
    headers: {
      ...CLERK_FETCH_HEADERS,
      ...(cookie ? { Cookie: cookie } : {}),
      ...init.headers
    }
  })
  mergeSetCookieIntoJar(r.headers, jar)
  return r
}

async function clerkBootstrap(jar: Map<string, string>): Promise<void> {
  await clerkFetch('/environment', jar, { method: 'GET' })
  await clerkFetch('/client', jar, { method: 'GET' })
}

async function clerkCompleteSession(
  jar: Map<string, string>,
  sessionId: string
): Promise<{ error: string } | { sessionJwt: string | null }> {
  let r = await clerkFetch(`/client/sessions/${encodeURIComponent(sessionId)}/touch`, jar, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active_organization_id: null, intent: 'select_session' })
  })
  let w = (await r.json().catch(() => ({}))) as ClerkWrapped
  if (!r.ok || firstClerkError(w)) {
    return { error: firstClerkError(w) || `Clerk touch HTTP ${r.status}` }
  }
  r = await clerkFetch(`/client/sessions/${encodeURIComponent(sessionId)}/tokens`, jar, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'organization_id='
  })
  const raw = (await r.json().catch(() => ({}))) as ClerkWrapped & Record<string, unknown>
  if (!r.ok || firstClerkError(raw)) {
    return { error: firstClerkError(raw) || `Clerk tokens HTTP ${r.status}` }
  }
  return { sessionJwt: extractJwtFromTokenPayload(raw) }
}

async function clerkSignInWithPassword(
  jar: Map<string, string>,
  email: string,
  password: string
): Promise<{ ok: true; sessionJwt?: string } | { error: string }> {
  const formSingle = `identifier=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
  let r = await clerkFetch('/client/sign_ins', jar, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formSingle
  })
  let w = (await r.json()) as ClerkWrapped
  const err0 = firstClerkError(w)
  if (err0) return { error: err0 }

  let sig = w.response
  if (!sig?.status) return { error: 'Clerk 响应异常' }

  if (sig.status === 'needs_first_factor' && sig.id) {
    const formPwd = `strategy=password&password=${encodeURIComponent(password)}`
    r = await clerkFetch(`/client/sign_ins/${encodeURIComponent(sig.id)}/attempt_first_factor`, jar, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formPwd
    })
    w = (await r.json()) as ClerkWrapped
    const err1 = firstClerkError(w)
    if (err1) return { error: err1 }
    sig = w.response
  }

  if (!sig?.status) return { error: 'Clerk 登录未完成' }

  if (sig.status === 'needs_second_factor') {
    return { error: '账户开启了两步验证，请先在网页完成登录' }
  }
  if (sig.status === 'needs_client_trust') {
    return { error: '需要客户端信任验证，请先在网页完成登录' }
  }

  const sessionId = sig.created_session_id
  if (sig.status !== 'complete' || !sessionId) {
    return { error: `Clerk 状态: ${sig.status}` }
  }

  const done = await clerkCompleteSession(jar, sessionId)
  if ('error' in done) return done

  const jwt = done.sessionJwt
  if (!jarHasSessionCookie(jar) && !(jwt && jwt.length > 0)) {
    return { error: '未获取到会话凭证（无 __session Cookie 且无 JWT）' }
  }
  return { ok: true, sessionJwt: jwt || undefined }
}

async function establishCtx7DashboardCookie(
  email: string,
  password: string
): Promise<{ cookieHeader: string; authorization?: string } | { error: string }> {
  const jar = new Map<string, string>()
  try {
    await clerkBootstrap(jar)
    const signed = await clerkSignInWithPassword(jar, email, password)
    if ('error' in signed) return { error: signed.error }
    const auth =
      signed.sessionJwt && signed.sessionJwt.length > 0 ? `Bearer ${signed.sessionJwt}` : undefined
    return { cookieHeader: jarToCookieHeader(jar), authorization: auth }
  } catch (error: unknown) {
    return { error: getErrorMessage(error) }
  }
}

function extractTeamspaceId(j: unknown): string | null {
  if (!j || typeof j !== 'object') return null
  const root = j as Record<string, unknown>
  const candidates: unknown[] = []

  if (Array.isArray(root)) {
    candidates.push(...root)
  } else {
    const data = root.data
    if (Array.isArray(data)) candidates.push(...data)
    else if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>
      for (const k of ['teamspaces', 'items', 'memberships', 'results']) {
        if (Array.isArray(d[k])) candidates.push(...d[k])
      }
    }
    for (const k of ['teamspaces', 'items', 'memberships', 'results']) {
      if (Array.isArray(root[k])) candidates.push(...root[k])
    }
  }

  for (const item of candidates) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.id === 'string' && o.id.length > 0) return o.id
    if (typeof o.teamspaceId === 'string') return o.teamspaceId
    const ts = o.teamspace
    if (ts && typeof ts === 'object') {
      const tid = (ts as Record<string, unknown>).id
      if (typeof tid === 'string') return tid
    }
  }
  return null
}

function extractRequestsQuota(j: unknown): { used: number; limit: number } | null {
  if (!j || typeof j !== 'object') return null
  const root = j as Record<string, unknown>
  const data =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root

  const rawUsed = data.userRequests ?? data.requestsUsed ?? data.used
  const rawLimit = data.quotaLimit ?? data.requestsLimit ?? data.limit

  const used = typeof rawUsed === 'number' ? rawUsed : typeof rawUsed === 'string' ? parseInt(rawUsed, 10) : NaN
  let limit = typeof rawLimit === 'number' ? rawLimit : NaN
  if (typeof rawLimit === 'string') {
    limit = parseInt(rawLimit.replace(/,/g, ''), 10)
  }
  if (!Number.isFinite(used) || !Number.isFinite(limit)) return null
  return { used, limit }
}

async function dashboardInit(session: Pick<Ctx7SessionEntry, 'cookieHeader' | 'authorization'>): Promise<void> {
  await fetch(`${CTX7_ORIGIN}/api/dashboard/init`, {
    method: 'POST',
    headers: dashboardAuthHeaders(session)
  }).catch(() => {})
}

async function fetchTeamspaceId(
  session: Pick<Ctx7SessionEntry, 'cookieHeader' | 'authorization'>
): Promise<string | null> {
  const urls = [
    `${CTX7_ORIGIN}/api/dashboard/teamspaces`,
    `${CTX7_ORIGIN}/api/dashboard/me/teamspace-memberships`
  ]
  for (const url of urls) {
    const r = await fetch(url, { headers: dashboardAuthHeaders(session) })
    if (!r.ok) continue
    const j = await r.json().catch(() => null)
    const id = extractTeamspaceId(j)
    if (id) return id
  }
  return null
}

async function fetchStats(
  teamspaceId: string,
  session: Pick<Ctx7SessionEntry, 'cookieHeader' | 'authorization'>
): Promise<{ used: number; limit: number } | { error: string }> {
  const r = await fetch(`${CTX7_ORIGIN}/api/dashboard/stats/${encodeURIComponent(teamspaceId)}`, {
    headers: dashboardAuthHeaders(session)
  })
  if (r.status === 401 || r.status === 403) return { error: '会话已失效' }
  if (!r.ok) return { error: `统计接口 HTTP ${r.status}` }
  const j = await r.json().catch(() => null)
  const q = extractRequestsQuota(j)
  if (!q) return { error: '未解析到 Requests 配额' }
  return q
}

async function resolveRequestsWithSession(
  session: Pick<Ctx7SessionEntry, 'cookieHeader' | 'authorization'>
): Promise<{ used: number; limit: number } | { error: string }> {
  await dashboardInit(session)
  const teamspaceId = await fetchTeamspaceId(session)
  if (!teamspaceId) return { error: '未找到 teamspace' }
  return fetchStats(teamspaceId, session)
}

async function sessionLooksValid(session: Pick<Ctx7SessionEntry, 'cookieHeader' | 'authorization'>): Promise<boolean> {
  await dashboardInit(session)
  const r = await fetch(`${CTX7_ORIGIN}/api/dashboard/teamspaces`, {
    headers: dashboardAuthHeaders(session)
  })
  return r.ok
}

export async function fetchContext7AccountRequests(data: Ctx7Credentials): Promise<Context7RequestsResult> {
  const key = data.email.toLowerCase()

  try {
    let entry = sessionByEmail.get(key)

    if (entry && (await sessionLooksValid(entry))) {
      const got = await resolveRequestsWithSession(entry)
      if ('used' in got) return { used: got.used, limit: got.limit }
      sessionByEmail.delete(key)
    } else if (entry) {
      sessionByEmail.delete(key)
    }

    const established = await establishCtx7DashboardCookie(data.email, data.password)
    if ('error' in established) return { used: null, limit: null, error: established.error }

    const nextEntry: Ctx7SessionEntry = {
      cookieHeader: established.cookieHeader,
      authorization: established.authorization
    }
    sessionByEmail.set(key, nextEntry)
    const got2 = await resolveRequestsWithSession(nextEntry)
    if ('used' in got2) return { used: got2.used, limit: got2.limit }

    sessionByEmail.delete(key)
    return { used: null, limit: null, error: 'error' in got2 ? got2.error : '拉取失败' }
  } catch (error: unknown) {
    return { used: null, limit: null, error: getErrorMessage(error) }
  }
}

export async function fetchAllContext7RequestsSequential(
  accounts: { id: number; email: string; password: string }[]
): Promise<Record<number, Context7RequestsResult>> {
  const entries = await Promise.all(
    accounts.map(async a => {
      const result = await fetchContext7AccountRequests({ email: a.email, password: a.password })
      return [a.id, result] as const
    })
  )
  return Object.fromEntries(entries)
}
