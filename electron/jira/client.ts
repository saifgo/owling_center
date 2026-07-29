import { shell } from 'electron'
import type {
  AppSettings,
  JiraAssigneeFilter,
  JiraCreateResult,
  JiraIssue,
  JiraSettings,
  JiraTestResult,
  JiraTransitionResult,
  Project
} from '../../shared/types'
import { getSettings } from '../store'

function authHeader(jira: JiraSettings): string {
  return `Basic ${Buffer.from(`${jira.email}:${jira.apiToken}`).toString('base64')}`
}

function requireConfiguredJira(settings?: AppSettings): JiraSettings {
  const jira = (settings ?? getSettings()).jira
  if (!jira.enabled) {
    throw new Error('Jira is disabled in App settings')
  }
  if (!jira.baseUrl || !jira.email || !jira.apiToken) {
    throw new Error('Jira base URL, email, and API token are required')
  }
  return jira
}

async function jiraFetch(
  path: string,
  init: RequestInit = {},
  settings?: AppSettings
): Promise<Response> {
  const jira = requireConfiguredJira(settings)
  const url = `${jira.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: authHeader(jira),
      ...(init.headers ?? {})
    }
  })
  return response
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      errorMessages?: string[]
      message?: string
      errors?: Record<string, string>
    }
    if (data.errorMessages?.length) return data.errorMessages.join('; ')
    if (data.message) return data.message
    if (data.errors) return Object.values(data.errors).join('; ')
  } catch {
    // ignore parse errors
  }
  return `${response.status} ${response.statusText}`
}

function toAdf(text: string): Record<string, unknown> {
  const lines = text.split(/\r?\n/)
  return {
    type: 'doc',
    version: 1,
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line.length > 0 ? [{ type: 'text', text: line }] : []
    }))
  }
}

function browseUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/browse/${key}`
}

function mapIssue(
  baseUrl: string,
  issue: {
    key: string
    fields?: {
      summary?: string
      status?: { name?: string; statusCategory?: { name?: string } }
      issuetype?: { name?: string }
      priority?: { name?: string }
      updated?: string
    }
  }
): JiraIssue {
  return {
    key: issue.key,
    summary: issue.fields?.summary ?? '(no summary)',
    status: issue.fields?.status?.name ?? 'Unknown',
    statusCategory: issue.fields?.status?.statusCategory?.name,
    issueType: issue.fields?.issuetype?.name ?? 'Issue',
    priority: issue.fields?.priority?.name,
    url: browseUrl(baseUrl, issue.key),
    updated: issue.fields?.updated
  }
}

export async function testJiraConnection(settings?: AppSettings): Promise<JiraTestResult> {
  try {
    const response = await jiraFetch('/rest/api/3/myself', {}, settings)
    if (!response.ok) {
      return { ok: false, message: await readError(response) }
    }
    const me = (await response.json()) as { displayName?: string; emailAddress?: string }
    return {
      ok: true,
      message: `Connected as ${me.displayName ?? me.emailAddress ?? 'Jira user'}`,
      displayName: me.displayName
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err)
    }
  }
}

/** Default: To Do + In Progress; optional assignee = currentUser(). Custom project JQL overrides. */
export function buildIssuesJql(
  projectKey: string,
  filter: JiraAssigneeFilter,
  custom?: string
): string {
  if (custom?.trim()) {
    const base = custom.trim()
    if (filter === 'mine' && !/assignee\s*=/i.test(base)) {
      return `(${base}) AND assignee = currentUser() ORDER BY updated DESC`
    }
    return /ORDER BY/i.test(base) ? base : `${base} ORDER BY updated DESC`
  }

  const statusClause = 'status in ("To Do", "In Progress", "In Review")'
  const assigneeClause = filter === 'mine' ? ' AND assignee = currentUser()' : ''
  return `project = ${projectKey} AND ${statusClause}${assigneeClause} ORDER BY updated DESC`
}

export async function searchProjectIssues(
  project: Project,
  filter: JiraAssigneeFilter = 'mine'
): Promise<JiraIssue[]> {
  const key = project.jira?.projectKey?.trim()
  if (!key) return []

  const jira = requireConfiguredJira()
  const jql = buildIssuesJql(key, filter, project.jira?.jql)
  const fields = ['summary', 'status', 'issuetype', 'priority', 'updated']

  let response = await jiraFetch('/rest/api/3/search/jql', {
    method: 'POST',
    body: JSON.stringify({
      jql,
      maxResults: 50,
      fields
    })
  })

  if (response.status === 404 || response.status === 410) {
    const params = new URLSearchParams({
      jql,
      maxResults: '50',
      fields: fields.join(',')
    })
    response = await jiraFetch(`/rest/api/3/search?${params.toString()}`)
  }

  if (!response.ok) {
    throw new Error(await readError(response))
  }

  const data = (await response.json()) as {
    issues?: Array<{
      key: string
      fields?: {
        summary?: string
        status?: { name?: string; statusCategory?: { name?: string } }
        issuetype?: { name?: string }
        priority?: { name?: string }
        updated?: string
      }
    }>
  }

  return (data.issues ?? []).map((issue) => mapIssue(jira.baseUrl, issue))
}

export async function createIssueFromNote(
  project: Project,
  summary: string,
  description?: string
): Promise<JiraCreateResult> {
  const key = project.jira?.projectKey?.trim()
  if (!key) {
    return { ok: false, error: 'This project has no Jira project key configured' }
  }

  try {
    const jira = requireConfiguredJira()
    const cleanSummary = summary.trim().slice(0, 255) || 'DevCenter session note'
    const response = await jiraFetch('/rest/api/3/issue', {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          project: { key },
          summary: cleanSummary,
          description: toAdf(description?.trim() || cleanSummary),
          issuetype: { name: 'Task' }
        }
      })
    })

    if (!response.ok) {
      return { ok: false, error: await readError(response) }
    }

    const created = (await response.json()) as { key: string }
    return {
      ok: true,
      key: created.key,
      url: browseUrl(jira.baseUrl, created.key)
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export async function openIssueInBrowser(url: string): Promise<void> {
  await shell.openExternal(url)
}

function normalizeStatus(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function statusMatches(actual: string, targets: string[]): boolean {
  const n = normalizeStatus(actual)
  return targets.some((t) => {
    const target = normalizeStatus(t)
    return n === target || n.includes(target) || target.includes(n)
  })
}

async function getIssueStatus(issueKey: string): Promise<string | undefined> {
  const response = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=status`)
  if (!response.ok) return undefined
  const data = (await response.json()) as {
    fields?: { status?: { name?: string } }
  }
  return data.fields?.status?.name
}

/**
 * Transition an issue to a target status by matching available workflow transitions.
 */
export async function transitionIssue(
  issueKey: string,
  targetStatusNames: string[]
): Promise<JiraTransitionResult> {
  try {
    const from = await getIssueStatus(issueKey)

    if (from && statusMatches(from, targetStatusNames)) {
      return {
        ok: true,
        message: `Already in ${from}`,
        from,
        to: from
      }
    }

    const listRes = await jiraFetch(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`
    )
    if (!listRes.ok) {
      return { ok: false, message: await readError(listRes), from }
    }

    const data = (await listRes.json()) as {
      transitions?: Array<{
        id: string
        name: string
        to?: { name?: string }
      }>
    }

    const transitions = data.transitions ?? []
    const match = transitions.find((t) =>
      statusMatches(t.to?.name ?? t.name, targetStatusNames)
    )

    if (!match) {
      const available = transitions
        .map((t) => t.to?.name ?? t.name)
        .filter(Boolean)
        .join(', ')
      return {
        ok: false,
        message: available
          ? `No transition to "${targetStatusNames[0]}" (available: ${available})`
          : `No transition to "${targetStatusNames[0]}" available`,
        from
      }
    }

    const doRes = await jiraFetch(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
      {
        method: 'POST',
        body: JSON.stringify({ transition: { id: match.id } })
      }
    )

    if (!doRes.ok) {
      return { ok: false, message: await readError(doRes), from }
    }

    const to = match.to?.name ?? match.name
    return {
      ok: true,
      message: `Moved ${issueKey} → ${to}`,
      from,
      to
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err)
    }
  }
}

/** Move To Do → In Progress (no-op if already In Progress). */
export async function transitionToInProgress(issueKey: string): Promise<JiraTransitionResult> {
  const from = await getIssueStatus(issueKey)
  if (from && statusMatches(from, ['In Progress'])) {
    return { ok: true, message: `Already In Progress`, from, to: from }
  }
  if (from && !statusMatches(from, ['To Do', 'Todo', 'Open'])) {
    return {
      ok: true,
      message: `Skipped status change (currently ${from})`,
      from,
      to: from
    }
  }
  return transitionIssue(issueKey, ['In Progress'])
}

/** Move In Progress → In Review. */
export async function transitionToInReview(issueKey: string): Promise<JiraTransitionResult> {
  return transitionIssue(issueKey, ['In Review', 'Review', 'Code Review'])
}
