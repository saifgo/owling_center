import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClaudePromptRequest, ClaudeThreadEvent, ClaudeThreadMessage } from '../../shared/types'
import { publishClaudeLimits } from './useClaudeLimits'

interface ClaudeThreadState {
  messages: ClaudeThreadMessage[]
  ready: boolean
  running: boolean
  error: string | null
  send: (request: Omit<ClaudePromptRequest, 'projectId'>) => Promise<void>
  stop: () => Promise<void>
  respond: (id: string, allowed: boolean) => Promise<void>
  reset: () => Promise<void>
  login: () => Promise<void>
  authBusy: boolean
}

function applyEvent(messages: ClaudeThreadMessage[], event: ClaudeThreadEvent): ClaudeThreadMessage[] {
  if (event.type === 'cleared') return []
  if (event.type === 'message') {
    if (messages.some((message) => message.id === event.message.id)) return messages
    return [...messages, event.message]
  }
  if (event.type === 'delta') {
    return messages.map((message) =>
      message.id === event.id ? { ...message, text: message.text + event.text } : message
    )
  }
  if (event.type === 'patch') {
    return messages.map((message) =>
      message.id === event.id
        ? {
            ...message,
            text: event.text ?? message.text,
            toolName: event.toolName ?? message.toolName,
            approval: event.approval ?? message.approval
          }
        : message
    )
  }
  return messages
}

export function useClaudeThread(projectId: string | null): ClaudeThreadState {
  const [messages, setMessages] = useState<ClaudeThreadMessage[]>([])
  const [ready, setReady] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const sendId = useRef(0)

  useEffect(() => {
    let cancelled = false
    sendId.current += 1
    setMessages([])
    setError(null)
    setRunning(false)
    setReady(false)
    if (!projectId) return
    void window.devcenter.claude.thread(projectId).then((thread) => {
      if (cancelled) return
      setMessages(thread.messages)
      setRunning(thread.running)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    return window.devcenter.claude.onEvent((event) => {
      if (!projectId || event.projectId !== projectId) return
      if (event.type === 'done') {
        setRunning(false)
        return
      }
      if (event.type === 'error') {
        setError(event.message)
        return
      }
      setMessages((current) => applyEvent(current, event))
    })
  }, [projectId])

  const send = useCallback(
    async (request: Omit<ClaudePromptRequest, 'projectId'>) => {
      if (!projectId) return
      const id = ++sendId.current
      setRunning(true)
      setError(null)
      try {
        const result = await window.devcenter.claude.prompt({ ...request, projectId })
        if (id !== sendId.current) return
        if (!result.ok) setError(result.message ?? 'Claude could not start')
      } catch (err) {
        if (id !== sendId.current) return
        setError(err instanceof Error ? err.message : 'Claude could not start')
      } finally {
        if (id === sendId.current) setRunning(false)
      }
    },
    [projectId]
  )

  const stop = useCallback(async () => {
    if (!projectId) return
    await window.devcenter.claude.stop(projectId)
  }, [projectId])

  const respond = useCallback(
    async (id: string, allowed: boolean) => {
      if (!projectId) return
      setMessages((current) =>
        current.map((message) =>
          message.id === id ? { ...message, approval: allowed ? 'allowed' : 'denied' } : message
        )
      )
      const ok = await window.devcenter.claude.respond(projectId, id, allowed)
      if (!ok) {
        setMessages((current) =>
          current.map((message) =>
            message.id === id ? { ...message, approval: 'pending' } : message
          )
        )
      }
    },
    [projectId]
  )

  const reset = useCallback(async () => {
    if (!projectId) return
    sendId.current += 1
    setMessages([])
    setError(null)
    setRunning(false)
    await window.devcenter.claude.reset(projectId)
  }, [projectId])

  const login = useCallback(async () => {
    setAuthBusy(true)
    try {
      publishClaudeLimits(await window.devcenter.claude.login())
    } finally {
      setAuthBusy(false)
    }
  }, [])

  return { messages, ready, running, error, send, stop, respond, reset, login, authBusy }
}
