import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import { FolderGit2, LogIn, Square } from 'lucide-react'
import type { ClaudeAccessMode, ClaudeEffort, ClaudeModelId, Project } from '../../shared/types'
import {
  CLAUDE_ACCESS_MODES,
  CLAUDE_EFFORTS,
  CLAUDE_MODELS
} from '../../shared/claudePrompt'
import { folderLabel } from '../../shared/projectPaths'
import { useClaudeLimits } from '../hooks/useClaudeLimits'
import { useClaudeThread } from '../hooks/useClaudeThread'
import type { ClaudeThreadMessage } from '../../shared/types'

interface ClaudePageProps {
  project: Project | null
  folder?: string
  branch?: string
}

export function ClaudePage({ project, folder, branch }: ClaudePageProps): React.JSX.Element {
  const { limits } = useClaudeLimits()
  const thread = useClaudeThread(project?.id ?? null)
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<ClaudeModelId>('opus')
  const [effort, setEffort] = useState<ClaudeEffort>('medium')
  const [access, setAccess] = useState<ClaudeAccessMode>('full')
  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = transcriptRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [thread.messages, thread.running])

  const signedOut =
    limits?.status === 'signed-out' ||
    limits?.status === 'missing-cli' ||
    limits?.status === 'unavailable'
  const canSend = Boolean(project && folder && prompt.trim() && thread.ready && !thread.running && !signedOut)

  const submit = (): void => {
    if (!canSend) return
    const text = prompt
    setPrompt('')
    void thread.send({ prompt: text, model, effort, access })
  }

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    submit()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-white/8 px-6 py-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {project?.name ?? 'Claude'}
          </h1>
          <p className="truncate text-sm text-white/45">
            {project && folder
              ? `${folderLabel(folder)}${branch ? ` · ${branch}` : ''}`
              : 'Write a prompt and run Claude Code in the selected project'}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!project || !thread.ready}
          onClick={() => void thread.reset()}
        >
          New chat
        </button>
      </header>

      <div ref={transcriptRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
        {!project && (
          <EmptyState title="Select a project" body="Claude runs in that project's local checkout." />
        )}
        {project && !folder && (
          <EmptyState
            title="This project has no folder"
            body="Add a folder in project settings, then write a prompt here."
          />
        )}
        {project && folder && thread.ready && thread.messages.length === 0 && (
          <EmptyState
            title="Ask Claude to work in this checkout"
            body="Prompts continue in the same Claude Code session until you start a new chat."
          />
        )}
        {thread.messages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            onRespond={(allowed) => void thread.respond(message.id, allowed)}
          />
        ))}
        {thread.running && <p className="text-xs text-white/40">Claude is working…</p>}
      </div>

      <form onSubmit={onSubmit} className="border-t border-white/8 px-6 py-4">
        {signedOut && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-sm text-white/70">
              {limits?.message || 'Sign in to Claude Code to send prompts from here.'}
            </p>
            {limits?.status !== 'missing-cli' && (
              <button
                type="button"
                className="btn btn-primary shrink-0"
                disabled={thread.authBusy}
                onClick={() => void thread.login()}
              >
                <LogIn size={15} />
                {thread.authBusy ? 'Waiting for sign-in…' : 'Sign in'}
              </button>
            )}
          </div>
        )}
        {thread.error && <p className="mb-2 text-sm text-danger">{thread.error}</p>}
        <textarea
          className="input min-h-24 resize-y"
          placeholder={project ? 'Ask Claude to work in this project' : 'Select a project first'}
          value={prompt}
          disabled={!project || !thread.ready || signedOut}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="claude-model">
            Model
          </label>
          <select
            id="claude-model"
            className="input w-auto"
            value={model}
            onChange={(event) => setModel(event.target.value as ClaudeModelId)}
          >
            {CLAUDE_MODELS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="claude-effort">
            Effort
          </label>
          <select
            id="claude-effort"
            className="input w-auto"
            value={effort}
            onChange={(event) => setEffort(event.target.value as ClaudeEffort)}
          >
            {CLAUDE_EFFORTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="claude-access">
            Access
          </label>
          <select
            id="claude-access"
            className="input w-auto"
            value={access}
            onChange={(event) => setAccess(event.target.value as ClaudeAccessMode)}
          >
            {CLAUDE_ACCESS_MODES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          {folder && (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-white/40">
              <FolderGit2 size={13} />
              <span className="truncate">{branch ? `${folderLabel(folder)} · ${branch}` : folderLabel(folder)}</span>
            </span>
          )}
          <span className="ml-auto text-[11px] text-white/30">Enter to send · Shift+Enter for a new line</span>
          {thread.running ? (
            <button type="button" className="btn btn-danger" onClick={() => void thread.stop()}>
              <Square size={13} fill="currentColor" />
              Stop
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={!canSend}>
              Send
            </button>
          )}
        </div>
      </form>
    </main>
  )
}

function EmptyState({ title, body }: { title: string; body: string }): React.JSX.Element {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 text-center">
      <p className="font-display text-xl font-semibold">{title}</p>
      <p className="mt-2 max-w-md text-sm text-white/45">{body}</p>
    </div>
  )
}

function MessageRow({
  message,
  onRespond
}: {
  message: ClaudeThreadMessage
  onRespond: (allowed: boolean) => void
}): React.JSX.Element | null {
  if (message.kind === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[42rem] whitespace-pre-wrap rounded-2xl bg-accent/15 px-4 py-2.5 text-sm text-surface-50">
          {message.text}
        </p>
      </div>
    )
  }

  if (message.kind === 'thinking') {
    if (!message.text) return null
    return (
      <details className="max-w-3xl rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
        <summary className="cursor-pointer text-xs text-white/45">Thinking</summary>
        <p className="mt-2 whitespace-pre-wrap text-sm text-white/55">{message.text}</p>
      </details>
    )
  }

  if (message.kind === 'tool') {
    return (
      <p className="max-w-3xl font-mono text-xs text-white/70">
        <span className="text-accent">{message.toolName ?? 'tool'}</span>
        {message.text && message.text !== message.toolName ? `  ${message.text}` : ''}
      </p>
    )
  }

  if (message.kind === 'approval') {
    return (
      <div className="max-w-3xl rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        <p className="text-xs uppercase tracking-wide text-white/40">
          {message.toolName ?? 'Tool'} needs approval
        </p>
        <p className="mt-1 whitespace-pre-wrap font-mono text-xs text-white/75">{message.text}</p>
        {message.approval === 'pending' ? (
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => onRespond(true)}>
              Approve
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onRespond(false)}>
              Deny
            </button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-white/45">
            {message.approval === 'allowed' ? 'Approved' : 'Denied'}
          </p>
        )}
      </div>
    )
  }

  if (message.kind === 'error') {
    return <p className="max-w-3xl whitespace-pre-wrap text-sm text-danger">{message.text}</p>
  }

  if (message.kind === 'status') {
    return <p className="text-xs text-white/40">{message.text}</p>
  }

  if (!message.text) return null
  return <p className="max-w-3xl whitespace-pre-wrap text-sm leading-6 text-surface-50">{message.text}</p>
}
