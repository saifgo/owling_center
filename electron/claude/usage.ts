import { spawn } from 'child_process'
import { readFile } from 'fs/promises'
import { homedir } from 'os'
import path from 'path'
import { shell } from 'electron'
import type { ClaudeAuthStatus, ClaudeLimitWindow, ClaudeLimits } from '../../shared/types'

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const BETA = 'oauth-2025-04-20'
const SESSION_MINS = 5 * 60
const WEEK_MINS = 7 * 24 * 60

interface OAuthBlock {
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  subscriptionType?: string
}

interface CredentialFile {
  raw: Record<string, unknown>
  oauth?: OAuthBlock
  unreadable?: boolean
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readCredentials(): Promise<CredentialFile | null> {
  const file = credentialsPath()
  for (let attempt = 0; attempt < 3; attempt++) {
    let text = ''
    try {
      text = await readFile(file, 'utf8')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return null
      if (attempt < 2) {
        await delay(40)
        continue
      }
      return { raw: {}, unreadable: true }
    }
    if (!text.trim()) {
      if (attempt < 2) {
        await delay(40)
        continue
      }
      return null
    }
    try {
      const raw = JSON.parse(text) as Record<string, unknown>
      const block = raw.claudeAiOauth
      if (!block || typeof block !== 'object') return { raw }
      return { raw, oauth: block as OAuthBlock }
    } catch {
      if (attempt < 2) {
        await delay(40)
        continue
      }
      return { raw: {}, unreadable: true }
    }
  }
  return { raw: {}, unreadable: true }
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
  if (response.status === 401) throw new Error('rejected')
  if (!response.ok) throw new Error('unavailable')
  return (await response.json()) as Record<string, unknown>
}

const SAVED_SIGN_IN = 'Claude still has your sign-in. Limits will show after Claude refreshes it.'

export async function getClaudeLimits(): Promise<ClaudeLimits> {
  const installed = await claudeExists()
  let authHint: ReturnType<typeof parseAuthText> = {}
  if (installed) {
    const status = await run('claude', ['auth', 'status'], 15000)
    authHint = parseAuthText(`${status.stdout}\n${status.stderr}`)
  }

  // Read after `claude auth status` so a refresh Claude Code just saved is visible.
  // This app never writes ~/.claude/.credentials.json. Claude Code rotates that
  // refresh token itself, and a second refresh invalidates the login.
  const creds = await readCredentials()

  if (creds?.unreadable) {
    return limits({
      status: 'unavailable',
      message: 'Could not read Claude sign-in data. It was left unchanged.'
    })
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

  const plan = planLabel(authHint.subscriptionType ?? oauth.subscriptionType)
  const email = authHint.email
  if (!oauth.accessToken) {
    return limits({
      status: 'unavailable',
      email,
      plan,
      message: SAVED_SIGN_IN
    })
  }

  try {
    let body: Record<string, unknown>
    try {
      body = await fetchUsage(oauth.accessToken)
    } catch (error) {
      const rejected = error instanceof Error && error.message === 'rejected'
      if (!rejected) throw error
      const again = await readCredentials()
      if (again?.unreadable) throw new Error('unavailable')
      const nextToken = again?.oauth?.accessToken
      if (nextToken && nextToken !== oauth.accessToken) {
        body = await fetchUsage(nextToken)
      } else if (again?.oauth?.refreshToken || oauth.refreshToken) {
        return limits({ status: 'unavailable', email, plan, message: SAVED_SIGN_IN })
      } else {
        throw new Error('signed-out')
      }
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
    const rejected = error instanceof Error && error.message === 'rejected'
    if (rejected && oauth.refreshToken) {
      return limits({ status: 'unavailable', email, plan, message: SAVED_SIGN_IN })
    }
    const status: ClaudeAuthStatus = signedOut || rejected ? 'signed-out' : 'unavailable'
    return limits({
      status,
      email,
      plan,
      message: signedOut || rejected ? 'Sign in to Claude again to read limits.' : 'Could not read limits.'
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
