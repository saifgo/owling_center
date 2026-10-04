import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { BrowserWindow, type WebContents } from 'electron'
import type { PermissionResult, Query } from '@anthropic-ai/claude-agent-sdk'
import { getProject } from '../store'
import { getProjectFolders } from '../../shared/projectPaths'
import {
  claudeModelAlias,
  claudePermission,
  isClaudeAccessMode,
  isClaudeEffort,
  isClaudeModelId
} from '../../shared/claudePrompt'
import type {
  ClaudeApprovalState,
  ClaudePromptRequest,
  ClaudePromptResult,
  ClaudeThreadEvent,
  ClaudeThreadMessage
} from '../../shared/types'
import {
  clearClaudeThread,
  getClaudeThread,
  insertClaudeMessage,
  nextClaudeSeq,
  saveClaudeSession,
  updateClaudeMessage
} from '../db'

interface ActiveRun {
  generation: number
  abort: AbortController
  query: Query | null
  approvals: Map<string, (result: PermissionResult) => void>
  sender: WebContents
}

const active = new Map<string, ActiveRun>()
const generation = new Map<string, number>()

function isCurrent(projectId: string, gen: number): boolean {
  return generation.get(projectId) === gen
}

function emit(_sender: WebContents, event: ClaudeThreadEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('claude:event', event)
  }
}

function remember(
  sender: WebContents,
  message: ClaudeThreadMessage,
  live = true
): ClaudeThreadMessage {
  insertClaudeMessage(message)
  if (live) emit(sender, { type: 'message', projectId: message.projectId, message })
  return message
}

function patchMessage(
  sender: WebContents,
  projectId: string,
  id: string,
  patch: { text?: string; toolName?: string; approval?: ClaudeApprovalState },
  immediate = false
): void {
  updateClaudeMessage(id, patch, immediate)
  emit(sender, { type: 'patch', projectId, id, ...patch })
}

function appendDelta(sender: WebContents, projectId: string, id: string, text: string, full: string): void {
  updateClaudeMessage(id, { text: full })
  emit(sender, { type: 'delta', projectId, id, text })
}

export function isClaudeRunning(projectId: string): boolean {
  return active.has(projectId)
}

export function readClaudeThread(projectId: string) {
  return getClaudeThread(projectId, active.has(projectId))
}

function stopRun(projectId: string): void {
  const run = active.get(projectId)
  if (!run) return
  run.abort.abort()
  for (const resolve of run.approvals.values()) {
    resolve({ behavior: 'deny', message: 'Stopped' })
  }
  run.approvals.clear()
  try {
    run.query?.close()
  } catch {
    // The process may already be gone.
  }
}

export function stopClaude(projectId: string): boolean {
  if (!active.has(projectId)) return false
  stopRun(projectId)
  return true
}

export function respondClaude(projectId: string, id: string, allowed: boolean): boolean {
  const run = active.get(projectId)
  const resolve = run?.approvals.get(id)
  if (!run || !resolve) return false
  run.approvals.delete(id)
  resolve(
    allowed ? { behavior: 'allow' } : { behavior: 'deny', message: 'Denied in Owling Center' }
  )
  patchMessage(
    run.sender,
    projectId,
    id,
    { approval: allowed ? 'allowed' : 'denied' },
    true
  )
  return true
}

export function resetClaude(projectId: string, sender: WebContents): void {
  generation.set(projectId, (generation.get(projectId) ?? 0) + 1)
  stopRun(projectId)
  active.delete(projectId)
  clearClaudeThread(projectId)
  emit(sender, { type: 'cleared', projectId })
}

function toolSummary(name: string, input: Record<string, unknown>): string {
  const command = input.command ?? input.cmd
  if (typeof command === 'string' && command.trim()) return command.trim()
  const file = input.file_path ?? input.path ?? input.notebook_path
  if (typeof file === 'string' && file.trim()) return file.trim()
  const description = input.description
  if (typeof description === 'string' && description.trim()) return description.trim()
  try {
    const json = JSON.stringify(input)
    return json.length > 280 ? `${json.slice(0, 280)}…` : json
  } catch {
    return name
  }
}

interface StreamBlock {
  type?: string
  id?: string
  name?: string
  text?: string
  thinking?: string
}

interface StreamDelta {
  type?: string
  text?: string
  thinking?: string
  partial_json?: string
}

interface StreamEvent {
  type?: string
  index?: number
  content_block?: StreamBlock
  delta?: StreamDelta
}

interface OpenBlock {
  id: string
  kind: 'assistant' | 'thinking' | 'tool'
  toolName?: string
  toolUseId?: string
  text: string
  json: string
}

function isAbort(err: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true
  return err instanceof Error && (err.name === 'AbortError' || /abort/i.test(err.message))
}

export async function runClaudePrompt(
  request: ClaudePromptRequest,
  sender: WebContents
): Promise<ClaudePromptResult> {
  const prompt = request.prompt?.trim() ?? ''
  if (!prompt) return { ok: false, message: 'Write a prompt first' }
  if (!isClaudeModelId(request.model) || !isClaudeEffort(request.effort) || !isClaudeAccessMode(request.access)) {
    return { ok: false, message: 'Choose a model, effort, and access mode' }
  }
  if (active.has(request.projectId)) {
    return { ok: false, message: 'Claude is already working in this project' }
  }

  const project = getProject(request.projectId)
  if (!project) return { ok: false, message: 'Project not found' }
  const cwd = getProjectFolders(project)[0]
  if (!cwd || !existsSync(cwd)) {
    return { ok: false, message: 'Add a project folder before prompting Claude' }
  }

  const gen = generation.get(request.projectId) ?? 0
  const saved = getClaudeThread(request.projectId)
  const abort = new AbortController()
  const run: ActiveRun = {
    generation: gen,
    abort,
    query: null,
    approvals: new Map(),
    sender
  }
  active.set(request.projectId, run)

  const userMessage: ClaudeThreadMessage = {
    id: randomUUID(),
    projectId: request.projectId,
    seq: nextClaudeSeq(request.projectId),
    kind: 'user',
    text: prompt,
    createdAt: new Date().toISOString()
  }
  remember(sender, userMessage)

  let sessionId = saved.sessionId ?? undefined
  const stderr: string[] = []
  const seenTools = new Set<string>()
  const blocks = new Map<number, OpenBlock>()
  let streamedText = false
  let streamedThinking = false

  const make = (
    kind: ClaudeThreadMessage['kind'],
    text: string,
    extra?: Pick<ClaudeThreadMessage, 'toolName' | 'approval'>
  ): ClaudeThreadMessage => {
    const message: ClaudeThreadMessage = {
      id: randomUUID(),
      projectId: request.projectId,
      seq: nextClaudeSeq(request.projectId),
      kind,
      text,
      createdAt: new Date().toISOString(),
      ...extra
    }
    return remember(sender, message)
  }

  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    if (!isCurrent(request.projectId, gen)) {
      return { ok: true, sessionId }
    }
    const permission = claudePermission(request.access)
    const q = query({
      prompt,
      options: {
        cwd,
        model: claudeModelAlias(request.model),
        effort: request.effort,
        permissionMode: permission.permissionMode,
        allowDangerouslySkipPermissions: permission.allowDangerouslySkipPermissions,
        ...(sessionId ? { resume: sessionId } : {}),
        includePartialMessages: true,
        abortController: abort,
        stderr: (data) => {
          stderr.push(data)
          if (stderr.length > 20) stderr.shift()
        },
        canUseTool: async (toolName, input, options) => {
          if (!isCurrent(request.projectId, gen) || abort.signal.aborted) {
            return { behavior: 'deny', message: 'Stopped' }
          }
          const summary = options.title || toolSummary(toolName, input)
          const message = make('approval', summary, { toolName, approval: 'pending' })
          return await new Promise<PermissionResult>((resolve) => {
            run.approvals.set(message.id, resolve)
            const onAbort = (): void => {
              if (!run.approvals.has(message.id)) return
              run.approvals.delete(message.id)
              patchMessage(sender, request.projectId, message.id, { approval: 'denied' }, true)
              resolve({ behavior: 'deny', message: 'Stopped' })
            }
            if (options.signal.aborted || abort.signal.aborted) {
              onAbort()
              return
            }
            options.signal.addEventListener('abort', onAbort, { once: true })
          })
        }
      }
    })
    run.query = q

    for await (const message of q as AsyncIterable<SdkTurnMessage>) {
      if (!isCurrent(request.projectId, gen)) break
      if (message.session_id && message.session_id !== sessionId) {
        sessionId = message.session_id
        saveClaudeSession(request.projectId, message.session_id, cwd)
      }

      if (message.type === 'stream_event') {
        const streamed = handleStream(message, request.projectId, sender, blocks, seenTools, make)
        if (streamed === 'text') streamedText = true
        if (streamed === 'thinking') streamedThinking = true
        continue
      }

      if (message.type === 'assistant') {
        const nested = Boolean(message.parent_tool_use_id)
        const content = message.message?.content
        if (!Array.isArray(content)) continue
        for (const block of content) {
          if (!block || typeof block !== 'object') continue
          if (block.type === 'tool_use' && typeof block.id === 'string') {
            if (seenTools.has(block.id)) continue
            seenTools.add(block.id)
            const input =
              block.input && typeof block.input === 'object'
                ? (block.input as Record<string, unknown>)
                : {}
            const name = typeof block.name === 'string' ? block.name : 'tool'
            make('tool', toolSummary(name, input), { toolName: name })
            continue
          }
          if (nested) continue
          if (block.type === 'text' && typeof block.text === 'string' && block.text && !streamedText) {
            make('assistant', block.text)
          } else if (
            block.type === 'thinking' &&
            typeof block.thinking === 'string' &&
            block.thinking &&
            !streamedThinking
          ) {
            make('thinking', block.thinking)
          }
        }
        if (message.error) {
          make('error', `Claude error: ${message.error}`)
        }
        continue
      }

      if (message.type === 'result') {
        if (abort.signal.aborted) continue
        if (message.subtype === 'success') {
          if (message.is_error && message.result) make('error', message.result)
        } else {
          const details = (message.errors ?? []).filter(Boolean).join('\n')
          make('error', details || 'Claude stopped before finishing')
        }
      }
    }

    if (abort.signal.aborted && isCurrent(request.projectId, gen)) {
      make('status', 'Stopped')
    }

    return { ok: true, sessionId }
  } catch (err) {
    if (!isCurrent(request.projectId, gen)) {
      return { ok: true, sessionId }
    }
    if (isAbort(err, abort.signal)) {
      make('status', 'Stopped')
      return { ok: true, sessionId }
    }
    const detail = err instanceof Error ? err.message : String(err)
    const extra = stderr.join('').trim()
    const message = extra && !detail.includes(extra.slice(0, 80)) ? `${detail}\n${extra}` : detail
    make('error', message)
    return { ok: false, message, sessionId }
  } finally {
    if (active.get(request.projectId) === run) active.delete(request.projectId)
    if (isCurrent(request.projectId, gen)) {
      emit(sender, { type: 'done', projectId: request.projectId })
    }
  }
}

function handleStream(
  message: SdkTurnMessage,
  projectId: string,
  sender: WebContents,
  blocks: Map<number, OpenBlock>,
  seenTools: Set<string>,
  make: (
    kind: ClaudeThreadMessage['kind'],
    text: string,
    extra?: Pick<ClaudeThreadMessage, 'toolName' | 'approval'>
  ) => ClaudeThreadMessage
): 'text' | 'thinking' | null {
  const event = message.event
  if (!event) return null
  const nested = Boolean(message.parent_tool_use_id)
  const index = event.index ?? 0

  if (event.type === 'content_block_start') {
    const block = event.content_block
    if (!block?.type) return null
    if (block.type === 'tool_use') {
      const toolUseId = block.id
      if (toolUseId) {
        if (seenTools.has(toolUseId)) return null
        seenTools.add(toolUseId)
      }
      const name = block.name || 'tool'
      const created = make('tool', name, { toolName: name })
      blocks.set(index, {
        id: created.id,
        kind: 'tool',
        toolName: name,
        toolUseId,
        text: name,
        json: ''
      })
      return null
    }
    if (nested) return null
    if (block.type === 'text' || block.type === 'thinking') {
      const kind = block.type === 'thinking' ? 'thinking' : 'assistant'
      blocks.set(index, { id: '', kind, text: '', json: '' })
    }
    return null
  }

  if (event.type === 'content_block_delta') {
    const open = blocks.get(index)
    const delta = event.delta
    if (!open || !delta?.type) return null
    if ((delta.type === 'text_delta' && delta.text) || (delta.type === 'thinking_delta' && delta.thinking)) {
      const piece = delta.text || delta.thinking || ''
      if (!open.id) {
        const created = make(open.kind, piece)
        open.id = created.id
        open.text = piece
      } else {
        open.text += piece
        appendDelta(sender, projectId, open.id, piece, open.text)
      }
      return open.kind === 'thinking' ? 'thinking' : 'text'
    }
    if (delta.type === 'input_json_delta' && delta.partial_json) {
      open.json += delta.partial_json
    }
    return null
  }

  if (event.type === 'content_block_stop') {
    const open = blocks.get(index)
    blocks.delete(index)
    if (!open || open.kind !== 'tool' || !open.json) return null
    try {
      const input = JSON.parse(open.json) as Record<string, unknown>
      const summary = toolSummary(open.toolName ?? 'tool', input)
      patchMessage(sender, projectId, open.id, { text: summary })
    } catch {
      // Keep the tool name until a complete block arrives.
    }
  }
  return null
}

interface SdkContentBlock {
  type?: string
  id?: string
  name?: string
  text?: string
  thinking?: string
  input?: unknown
}

interface SdkTurnMessage {
  type?: string
  subtype?: string
  session_id?: string
  parent_tool_use_id?: string | null
  error?: string
  is_error?: boolean
  result?: string
  errors?: string[]
  event?: StreamEvent
  message?: { content?: SdkContentBlock[] }
}
