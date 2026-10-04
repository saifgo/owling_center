import { spawn } from 'child_process'
import { readFile, rename, writeFile } from 'fs/promises'
import { homedir } from 'os'
import path from 'path'
import { shell } from 'electron'
import type { ClaudeAuthStatus, ClaudeLimitWindow, ClaudeLimits } from '../../shared/types'

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token'
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const BETA = 'oauth-2025-04-20'
const REFRESH_SKEW_MS = 5 * 60_000
const SESSION_MINS = 5 * 60
const WEEK_MINS = 7 * 24 * 60

interface OAuthBlock {
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  subscriptionType?: string
}

function credentialsPath(): string {
  return path.join(homedir(), '.claude', '.credentials.json')
}

function checkedNow(): string {
  return new Date().toISOString()
}

function limits(partial: Omit<ClaudeLimits, 'checkedAt' | 'windows'> & { windows?: ClaudeLimitWindow[] }): ClaudeLimits {
  return {
    checkedAt: checkedNow(),
    windows: partial.windows ?? [],
    status: partial.status,
    ...(partial.email ? { email: partial.email } : {}),
    ...(partial.plan ? { plan: partial.plan } : {}),
    ...(partial.message ? { message: partial.message } : {})
  }
}

async function readCredentials(): Promise<{ raw: Record<string, unknown>; oauth?: OAuthBlock } | null> {
  try {
    const text = await readFile(credentialsPath(), 'utf8')
    const raw = JSON.parse(text) as Record<string, unknown>
    const block = raw.claudeAiOauth
    if (!block || typeof block !== 'object') return { raw }
    return { raw, oauth: block as OAuthBlock }
  } catch {
    return null
  }
}

async function writeCredentials(raw: Record<string, unknown>): Promise<void> {
  const file = credentialsPath()
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(raw, null, 2), 'utf8')
  await rename(tmp, file)
}

function run(command: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true, shell: process.platform === 'win32' })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
    }, timeoutMs)
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ code: 1, stdout, stderr })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

async function claudeExists(): Promise<boolean> {
  const probe = process.platform === 'win32' ? await run('where', ['claude'], 8000) : await run('which', ['claude'], 8000)
  return probe.code === 0 && probe.stdout.trim().length > 0
}

function planLabel(subscriptionType: string | undefined): string | undefined {
  const normalized = subscriptionType?.toLowerCase().replace(/[\s_-]+/g, '')
  if (!normalized) return undefined
  const known: Record<string, string> = {
    claudemaxsubscription: 'Max',
    claudemax5xsubscription: 'Max 5x',
    claudemax20xsubscription: 'Max 20x',
    claudeenterprisesubscription: 'Enterprise',
    claudeteamsubscription: 'Team',
    claudeprosubscription: 'Pro',
    claudefreesubscription: 'Free',
    max: 'Max',
    maxplan: 'Max',
    max5: 'Max 5x',
    max20: 'Max 20x',
    enterprise: 'Enterprise',
    team: 'Team',
    pro: 'Pro',
    free: 'Free'
  }
  return known[normalized] ?? subscriptionType
}

function parseAuthText(text: string): { email?: string; subscriptionType?: string; apiKey?: boolean; loggedIn?: boolean } {
  const trimmed = text.trim()
  if (!trimmed) return {}
  try {
    const json = JSON.parse(trimmed) as Record<string, unknown>
    const authMethod = String(json.authMethod ?? json.tokenSource ?? '').toLowerCase()
    return {
      email: typeof json.email === 'string' ? json.email : undefined,
      subscriptionType: typeof json.subscriptionType === 'string' ? json.subscriptionType : undefined,
      apiKey: authMethod.includes('apikey') || authMethod.includes('api_key'),
      loggedIn: json.loggedIn === true || json.logged_in === true
    }
  } catch {
    const email = trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
    const apiKey = /api[ _-]?key/i.test(trimmed)
    return { email, apiKey, loggedIn: /logged in|authenticated/i.test(trimmed) }
  }
}

async function refreshAccessToken(raw: Record<string, unknown>, oauth: OAuthBlock): Promise<string | undefined> {
  if (!oauth.refreshToken) return oauth.accessToken
  const expiresAt = typeof oauth.expiresAt === 'number' ? oauth.expiresAt : 0
  if (oauth.accessToken && expiresAt - Date.now() > REFRESH_SKEW_MS) return oauth.accessToken

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: oauth.refreshToken,
      client_id: CLIENT_ID,
      scope: 'user:profile user:inference user:sessions:claude_code user:mcp_servers'
    })
  })
  if (!response.ok) return oauth.accessToken
  const body = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }
  if (!body.access_token) return oauth.accessToken
  const next: OAuthBlock = {
    ...oauth,
    accessToken: body.access_token,
    refreshToken: body.refresh_token || oauth.refreshToken,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000
  }
  raw.claudeAiOauth = next
  await writeCredentials(raw)
  return next.accessToken
}

function asWindow(
  id: string,
  kind: ClaudeLimitWindow['kind'],
  label: string,
  minutes: number,
  value: unknown
): ClaudeLimitWindow | null {
  if (!value || typeof value !== 'object') return null
  const row = value as { utilization?: unknown; resets_at?: unknown }
  if (typeof row.utilization !== 'number' || !Number.isFinite(row.utilization)) return null
  const used = Math.max(0, Math.min(100, row.utilization))
  const resetsAt = typeof row.resets_at === 'string' && row.resets_at ? row.resets_at : undefined
  return {
    id,
    kind,
    label,
    usedPercent: used,
    windowDurationMins: minutes,
    ...(resetsAt ? { resetsAt } : {})
  }
}

function windowsFromUsage(body: Record<string, unknown>): ClaudeLimitWindow[] {
  const windows: ClaudeLimitWindow[] = []
  const session = asWindow('five_hour', 'session', 'Session', SESSION_MINS, body.five_hour)
  const weekly = asWindow('seven_day', 'weekly', 'Weekly', WEEK_MINS, body.seven_day)
  if (session) windows.push(session)
  if (weekly) windows.push(weekly)

  const named: Record<string, string> = {
    seven_day_opus: 'Opus',
    seven_day_sonnet: 'Sonnet',
    seven_day_haiku: 'Haiku',
    seven_day_fable: 'Fable'
  }
  for (const [id, label] of Object.entries(named)) {
    const window = asWindow(id, 'weekly', `Weekly · ${label}`, WEEK_MINS, body[id])
    if (window) windows.push(window)
  }

  const scoped = body.model_scoped
  if (Array.isArray(scoped)) {
    for (const entry of scoped) {
      if (!entry || typeof entry !== 'object') continue
      const row = entry as { display_name?: unknown; utilization?: unknown; resets_at?: unknown }
      if (typeof row.display_name !== 'string') continue
      const window = asWindow(
        `seven_day_${row.display_name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        'weekly',
        `Weekly · ${row.display_name}`,
        WEEK_MINS,
        { utilization: row.utilization, resets_at: row.resets_at }
      )
      if (window) windows.push(window)
    }
  }
  return windows
}

async function fetchUsage(token: string): Promise<Record<string, unknown>> {
  const response = await fetch(USAGE_URL, {
    headers: {
      authorization: `Bearer ${token}`,
      'anthropic-beta': BETA,
      accept: 'application/json'
    }
  })
  if (response.status === 401 || response.status === 403) {
    throw new Error('signed-out')
  }
  if (!response.ok) throw new Error('unavailable')
  return (await response.json()) as Record<string, unknown>
}

export async function getClaudeLimits(): Promise<ClaudeLimits> {
  const installed = await claudeExists()
  const creds = await readCredentials()
  let authHint: ReturnType<typeof parseAuthText> = {}
  if (installed) {
    const status = await run('claude', ['auth', 'status'], 15000)
    authHint = parseAuthText(`${status.stdout}\n${status.stderr}`)
  }

  if (!creds?.oauth?.accessToken && !creds?.oauth?.refreshToken) {
    if (authHint.apiKey || (creds && !creds.oauth)) {
      return limits({
        status: 'api-key',
        message: 'This account has no subscription limits.'
      })
    }
    return limits({
      status: installed ? 'signed-out' : 'missing-cli',
      message: installed
        ? 'Sign in with Claude to see session and weekly limits.'
        : 'Claude CLI was not found. Install Claude Code, then sign in.'
    })
  }

  const oauth = creds.oauth
  if (!oauth) {
    return limits({ status: 'api-key', message: 'This account has no subscription limits.' })
  }

  let token: string | undefined
  try {
    token = await refreshAccessToken(creds.raw, oauth)
  } catch {
    token = oauth.accessToken
  }
  if (!token) {
    return limits({
      status: 'signed-out',
      message: 'Sign in with Claude to see session and weekly limits.'
    })
  }

  const plan = planLabel(authHint.subscriptionType ?? oauth.subscriptionType)
  const email = authHint.email

  try {
    let body: Record<string, unknown>
    try {
      body = await fetchUsage(token)
    } catch (error) {
      const rejected = error instanceof Error && error.message === 'signed-out'
      if (!rejected || !oauth.refreshToken) throw error
      const refreshed = await refreshAccessToken(creds.raw, { ...oauth, accessToken: undefined, expiresAt: 0 })
      if (!refreshed || refreshed === token) throw error
      body = await fetchUsage(refreshed)
    }
    const windows = windowsFromUsage(body)
    if (windows.length === 0) {
      return limits({
        status: 'api-key',
        email,
        plan,
        message: 'This account has no subscription limits.'
      })
    }
    return limits({ status: 'authenticated', email, plan, windows })
  } catch (error) {
    const signedOut = error instanceof Error && error.message === 'signed-out'
    const status: ClaudeAuthStatus = signedOut ? 'signed-out' : 'unavailable'
    return limits({
      status,
      email,
      plan,
      message: signedOut ? 'Sign in to Claude again to read limits.' : 'Could not read limits.'
    })
  }
}

function openLoginUrls(text: string, opened: Set<string>): void {
  const urls = text.match(/https:\/\/\S+/g) ?? []
  for (const url of urls) {
    const clean = url.replace(/[),.;]+$/, '')
    if (opened.has(clean)) continue
    opened.add(clean)
    void shell.openExternal(clean)
  }
}

export async function loginClaude(): Promise<ClaudeLimits> {
  const installed = await claudeExists()
  if (!installed) {
    return limits({
      status: 'missing-cli',
      message: 'Claude CLI was not found. Install Claude Code, then sign in.'
    })
  }

  const result = await new Promise<{ code: number; text: string }>((resolve) => {
    const child = spawn('claude', ['auth', 'login'], {
      windowsHide: false,
      shell: process.platform === 'win32'
    })
    let text = ''
    const opened = new Set<string>()
    const capture = (chunk: Buffer): void => {
      text += chunk.toString()
      openLoginUrls(text, opened)
    }
    child.stdout?.on('data', capture)
    child.stderr?.on('data', capture)
    const timer = setTimeout(() => {
      child.kill()
      resolve({ code: 1, text })
    }, 5 * 60_000)
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ code: 1, text })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, text })
    })
  })

  const next = await getClaudeLimits()
  if (result.code !== 0 && next.status !== 'authenticated') {
    return { ...next, message: next.message ?? 'Claude sign-in did not finish.' }
  }
  return next
}

export async function logoutClaude(): Promise<ClaudeLimits> {
  const installed = await claudeExists()
  if (installed) {
    await run('claude', ['auth', 'logout'], 20000)
  }
  return getClaudeLimits()
}
