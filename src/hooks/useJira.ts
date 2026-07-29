import { useCallback, useEffect, useState } from 'react'
import type {
  BranchCreateResult,
  JiraAssigneeFilter,
  JiraIssue,
  JiraTransitionResult
} from '../../shared/types'

export function useJira(
  projectId: string | null,
  enabled: boolean,
  projectKey?: string
): {
  issues: JiraIssue[]
  loading: boolean
  error: string | null
  assigneeFilter: JiraAssigneeFilter
  setAssigneeFilter: (filter: JiraAssigneeFilter) => void
  refresh: () => Promise<void>
  openIssue: (url: string) => Promise<void>
  createFromNote: (summary: string, description?: string) => Promise<{ ok: boolean; message: string }>
  createBranches: (issueKey: string, summary: string) => Promise<BranchCreateResult>
  moveToInProgress: (issueKey: string) => Promise<JiraTransitionResult>
  moveToInReview: (issueKey: string) => Promise<JiraTransitionResult>
} {
  const [issues, setIssues] = useState<JiraIssue[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState<JiraAssigneeFilter>('mine')

  const refresh = useCallback(async () => {
    if (!projectId || !enabled || !projectKey?.trim()) {
      setIssues([])
      setError(null)
      return
    }
    setLoading(true)
    try {
      const list = await window.devcenter.jira.issues(projectId, assigneeFilter)
      setIssues(list)
      setError(null)
    } catch (err) {
      setIssues([])
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [projectId, enabled, projectKey, assigneeFilter])

  useEffect(() => {
    void refresh()
    if (!projectId || !enabled || !projectKey?.trim()) return
    const id = window.setInterval(() => void refresh(), 60_000)
    return () => window.clearInterval(id)
  }, [refresh, projectId, enabled, projectKey])

  const openIssue = useCallback(async (url: string) => {
    await window.devcenter.jira.open(url)
  }, [])

  const createFromNote = useCallback(
    async (summary: string, description?: string) => {
      if (!projectId) return { ok: false, message: 'No project selected' }
      const result = await window.devcenter.jira.createFromNote(projectId, summary, description)
      if (result.ok) {
        await refresh()
        return { ok: true, message: `Created ${result.key}` }
      }
      return { ok: false, message: result.error ?? 'Failed to create issue' }
    },
    [projectId, refresh]
  )

  const createBranches = useCallback(
    async (issueKey: string, summary: string) => {
      if (!projectId) {
        return { ok: false, branchName: '', results: [] }
      }
      const result = await window.devcenter.jira.createBranches(projectId, issueKey, summary)
      await refresh()
      return result
    },
    [projectId, refresh]
  )

  const moveToInProgress = useCallback(
    async (issueKey: string) => {
      const result = await window.devcenter.jira.moveToInProgress(issueKey)
      await refresh()
      return result
    },
    [refresh]
  )

  const moveToInReview = useCallback(
    async (issueKey: string) => {
      const result = await window.devcenter.jira.moveToInReview(issueKey)
      await refresh()
      return result
    },
    [refresh]
  )

  return {
    issues,
    loading,
    error,
    assigneeFilter,
    setAssigneeFilter,
    refresh,
    openIssue,
    createFromNote,
    createBranches,
    moveToInProgress,
    moveToInReview
  }
}
