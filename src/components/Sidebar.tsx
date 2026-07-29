import { useState } from 'react'
import {
  CheckSquare,
  ExternalLink,
  GitBranch,
  Plus,
  RefreshCw,
  StickyNote,
  Ticket,
  Trash2,
  ListTodo
} from 'lucide-react'
import type {
  JiraAssigneeFilter,
  JiraIssue,
  Project,
  SessionNote,
  TodoItem
} from '../../shared/types'
import logoUrl from '../assets/logo.png'

interface SidebarProps {
  projects: Project[]
  selectedProjectId: string | null
  onSelect: (id: string) => void
  todos: TodoItem[]
  notes: SessionNote[]
  onAddTodo: (text: string) => Promise<void>
  onToggleTodo: (id: string) => Promise<void>
  onDeleteTodo: (id: string) => Promise<void>
  onAddNote: (text: string) => Promise<void>
  onDeleteNote: (id: string) => Promise<void>
  jiraEnabled: boolean
  jiraIssues: JiraIssue[]
  jiraLoading: boolean
  jiraError: string | null
  jiraAssigneeFilter: JiraAssigneeFilter
  onJiraFilterChange: (filter: JiraAssigneeFilter) => void
  onRefreshJira: () => Promise<void>
  onOpenJiraIssue: (url: string) => Promise<void>
  onCreateBranches: (issue: JiraIssue) => Promise<void>
  creatingBranches: boolean
  onMoveToInProgress: (issue: JiraIssue) => Promise<void>
  onMoveToInReview: (issue: JiraIssue) => Promise<void>
  transitioning: boolean
  onCreateJiraFromNote: (text: string) => Promise<void>
}

export function Sidebar({
  projects,
  selectedProjectId,
  onSelect,
  todos,
  notes,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  onAddNote,
  onDeleteNote,
  jiraEnabled,
  jiraIssues,
  jiraLoading,
  jiraError,
  jiraAssigneeFilter,
  onJiraFilterChange,
  onRefreshJira,
  onOpenJiraIssue,
  onCreateBranches,
  creatingBranches,
  onMoveToInProgress,
  onMoveToInReview,
  transitioning,
  onCreateJiraFromNote
}: SidebarProps): React.JSX.Element {
  const [todoText, setTodoText] = useState('')
  const [noteText, setNoteText] = useState('')
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null)
  const selected = projects.find((p) => p.id === selectedProjectId)
  const hasJiraKey = Boolean(selected?.jira?.projectKey)
  const selectedIssue = jiraIssues.find((i) => i.key === selectedIssueKey) ?? null

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-white/8 bg-surface-950/50">
      <div className="border-b border-white/8 px-4 py-4">
        <div className="flex items-center gap-3">
          <img
            src={logoUrl}
            alt="Owling Center"
            className="h-9 w-9 shrink-0 rounded-md object-contain"
          />
          <div className="min-w-0">
            <p className="font-display text-xl font-semibold tracking-tight text-accent">
              Owling Center
            </p>
            <p className="mt-0.5 text-xs text-white/40">The power of wisdom</p>
          </div>
        </div>
      </div>

      <div className="border-b border-white/8 px-3 py-3">
        <p className="label">Projects</p>
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {projects.length === 0 && (
            <p className="px-2 py-2 text-xs text-white/35">No projects yet</p>
          )}
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSelect(p.id)
                setSelectedIssueKey(null)
              }}
              className={[
                'w-full rounded-md px-2 py-1.5 text-left text-sm transition',
                selectedProjectId === p.id
                  ? 'bg-accent/15 text-accent'
                  : 'text-white/70 hover:bg-white/5'
              ].join(' ')}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate">{p.name}</span>
                {p.jira?.projectKey && (
                  <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">
                    {p.jira.projectKey}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3">
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/50">
              <Ticket size={14} />
              Jira
              {selected?.jira?.projectKey ? ` · ${selected.jira.projectKey}` : ''}
            </div>
            {jiraEnabled && hasJiraKey && (
              <button
                type="button"
                className="text-white/40 hover:text-accent"
                title="Refresh Jira issues"
                onClick={() => void onRefreshJira()}
              >
                <RefreshCw size={13} className={jiraLoading ? 'animate-spin' : undefined} />
              </button>
            )}
          </div>

          {jiraEnabled && hasJiraKey && (
            <div className="mb-2 flex rounded-md border border-white/10 p-0.5 text-[11px]">
              <button
                type="button"
                className={[
                  'flex-1 rounded px-2 py-1 transition',
                  jiraAssigneeFilter === 'mine'
                    ? 'bg-accent/20 text-accent'
                    : 'text-white/45 hover:text-white/70'
                ].join(' ')}
                onClick={() => onJiraFilterChange('mine')}
              >
                Assigned to me
              </button>
              <button
                type="button"
                className={[
                  'flex-1 rounded px-2 py-1 transition',
                  jiraAssigneeFilter === 'all'
                    ? 'bg-accent/20 text-accent'
                    : 'text-white/45 hover:text-white/70'
                ].join(' ')}
                onClick={() => onJiraFilterChange('all')}
              >
                All tickets
              </button>
            </div>
          )}

          {!selected ? (
            <p className="text-xs text-white/35">Select a project to see Jira issues</p>
          ) : !jiraEnabled ? (
            <p className="text-xs text-white/35">Enable Jira in App settings</p>
          ) : !hasJiraKey ? (
            <p className="text-xs text-white/35">Set a Jira project key on this project</p>
          ) : jiraError ? (
            <p className="text-xs text-danger">{jiraError}</p>
          ) : (
            <ul className="space-y-1.5">
              {jiraIssues.map((issue) => {
                const isSelected = selectedIssueKey === issue.key
                return (
                  <li key={issue.key}>
                    <button
                      type="button"
                      className={[
                        'w-full rounded-md border px-2 py-1.5 text-left transition',
                        isSelected
                          ? 'border-accent/40 bg-accent/10'
                          : 'border-white/8 bg-white/[0.03] hover:border-accent/30 hover:bg-accent/5'
                      ].join(' ')}
                      onClick={() =>
                        setSelectedIssueKey((prev) => (prev === issue.key ? null : issue.key))
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-accent">{issue.key}</span>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">
                          {issue.status}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-white/75">{issue.summary}</p>
                      {issue.priority && (
                        <p className="mt-1 text-[10px] text-white/35">{issue.priority}</p>
                      )}
                    </button>

                    {isSelected && selectedIssue && (
                      <div className="mt-1 flex flex-col gap-1 rounded-md border border-white/8 bg-surface-950/60 p-1.5">
                        <button
                          type="button"
                          className="btn btn-ghost w-full justify-start text-xs"
                          onClick={() => void onOpenJiraIssue(issue.url)}
                        >
                          <ExternalLink size={12} />
                          Open in Jira
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary w-full justify-start text-xs"
                          disabled={creatingBranches}
                          onClick={() => void onCreateBranches(issue)}
                          title="Create branch from dev and move To Do → In Progress"
                        >
                          <GitBranch size={12} />
                          {creatingBranches ? 'Creating branches…' : 'Create branch from dev'}
                        </button>
                        {/to\s*do|todo|open/i.test(issue.status) && (
                          <button
                            type="button"
                            className="btn btn-ghost w-full justify-start text-xs"
                            disabled={transitioning}
                            onClick={() => void onMoveToInProgress(issue)}
                            title="Move ticket To Do → In Progress"
                          >
                            <Ticket size={12} />
                            {transitioning ? 'Updating…' : 'Move to In Progress'}
                          </button>
                        )}
                        {/in progress/i.test(issue.status) && (
                          <button
                            type="button"
                            className="btn btn-ghost w-full justify-start text-xs"
                            disabled={transitioning}
                            onClick={() => void onMoveToInReview(issue)}
                            title="Move ticket In Progress → In Review"
                          >
                            <Ticket size={12} />
                            {transitioning ? 'Updating…' : 'Move to In Review'}
                          </button>
                        )}
                        <p className="px-1 text-[10px] leading-snug text-white/35">
                          Branch uses the ticket key in every git folder (from{' '}
                          <span className="font-mono text-white/50">dev</span>). Creating a branch
                          also moves <span className="text-white/50">To Do → In Progress</span>.
                        </p>
                      </div>
                    )}
                  </li>
                )
              })}
              {!jiraLoading && jiraIssues.length === 0 && (
                <li className="text-xs text-white/35">
                  No To Do / In Progress / In Review tickets
                  {jiraAssigneeFilter === 'mine' ? ' assigned to you' : ''}
                </li>
              )}
              {jiraLoading && jiraIssues.length === 0 && (
                <li className="text-xs text-white/35">Loading…</li>
              )}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/50">
            <ListTodo size={14} />
            To-dos {selected ? `· ${selected.name}` : ''}
          </div>
          {!selected ? (
            <p className="text-xs text-white/35">Select a project to manage tasks</p>
          ) : (
            <>
              <form
                className="mb-2 flex gap-1"
                onSubmit={(e) => {
                  e.preventDefault()
                  void onAddTodo(todoText).then(() => setTodoText(''))
                }}
              >
                <input
                  className="input"
                  placeholder="Add a task…"
                  value={todoText}
                  onChange={(e) => setTodoText(e.target.value)}
                />
                <button type="submit" className="btn btn-ghost shrink-0 px-2" title="Add">
                  <Plus size={16} />
                </button>
              </form>
              <ul className="space-y-1">
                {todos.map((t) => (
                  <li
                    key={t.id}
                    className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-white/5"
                  >
                    <button
                      type="button"
                      className="mt-0.5 text-white/40 hover:text-accent"
                      onClick={() => void onToggleTodo(t.id)}
                    >
                      <CheckSquare
                        size={15}
                        className={t.completed ? 'text-accent' : undefined}
                      />
                    </button>
                    <span
                      className={[
                        'flex-1 text-sm',
                        t.completed ? 'text-white/35 line-through' : 'text-white/80'
                      ].join(' ')}
                    >
                      {t.text}
                    </span>
                    <button
                      type="button"
                      className="opacity-0 text-white/35 hover:text-danger group-hover:opacity-100"
                      onClick={() => void onDeleteTodo(t.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
                {todos.length === 0 && (
                  <li className="text-xs text-white/35">No tasks for this project</li>
                )}
              </ul>
            </>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/50">
            <StickyNote size={14} />
            Session notes
          </div>
          {!selected ? (
            <p className="text-xs text-white/35">Select a project first</p>
          ) : (
            <>
              <form
                className="mb-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void onAddNote(noteText).then(() => setNoteText(''))
                }}
              >
                <textarea
                  className="input min-h-[72px] resize-none"
                  placeholder="Quick dump: bugs, ideas…"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <div className="mt-1 flex gap-1">
                  <button type="submit" className="btn btn-ghost flex-1">
                    Save note
                  </button>
                  {jiraEnabled && hasJiraKey && (
                    <button
                      type="button"
                      className="btn btn-ghost shrink-0 text-xs"
                      disabled={!noteText.trim()}
                      title="Create Jira Task from this note"
                      onClick={() => {
                        const text = noteText.trim()
                        if (!text) return
                        void onCreateJiraFromNote(text).then(() => setNoteText(''))
                      }}
                    >
                      <Ticket size={13} />
                      To Jira
                    </button>
                  )}
                </div>
              </form>
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="group rounded-md border border-white/8 bg-white/[0.03] p-2"
                  >
                    <p className="whitespace-pre-wrap text-xs text-white/75">{n.text}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-white/30">
                        {new Date(n.createdAt).toLocaleString()}
                      </span>
                      <div className="flex items-center gap-2">
                        {jiraEnabled && hasJiraKey && (
                          <button
                            type="button"
                            className="opacity-0 text-[10px] text-accent hover:underline group-hover:opacity-100"
                            onClick={() => void onCreateJiraFromNote(n.text)}
                          >
                            To Jira
                          </button>
                        )}
                        <button
                          type="button"
                          className="opacity-0 text-white/35 hover:text-danger group-hover:opacity-100"
                          onClick={() => void onDeleteNote(n.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </aside>
  )
}
