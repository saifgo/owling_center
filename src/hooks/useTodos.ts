import { useCallback, useEffect, useState } from 'react'
import type { SessionNote, TodoItem } from '../../shared/types'

export function useTodos(projectId: string | null): {
  todos: TodoItem[]
  notes: SessionNote[]
  addTodo: (text: string) => Promise<void>
  toggleTodo: (id: string) => Promise<void>
  deleteTodo: (id: string) => Promise<void>
  addNote: (text: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  refresh: () => Promise<void>
} {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [notes, setNotes] = useState<SessionNote[]>([])

  const refresh = useCallback(async () => {
    if (!projectId) {
      setTodos([])
      setNotes([])
      return
    }
    const [t, n] = await Promise.all([
      window.devcenter.todos.list(projectId),
      window.devcenter.notes.list(projectId)
    ])
    setTodos(t)
    setNotes(n)
  }, [projectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addTodo = useCallback(
    async (text: string) => {
      if (!projectId || !text.trim()) return
      await window.devcenter.todos.add(projectId, text)
      await refresh()
    },
    [projectId, refresh]
  )

  const toggleTodo = useCallback(
    async (id: string) => {
      await window.devcenter.todos.toggle(id)
      await refresh()
    },
    [refresh]
  )

  const deleteTodo = useCallback(
    async (id: string) => {
      await window.devcenter.todos.delete(id)
      await refresh()
    },
    [refresh]
  )

  const addNote = useCallback(
    async (text: string) => {
      if (!projectId || !text.trim()) return
      await window.devcenter.notes.add(projectId, text)
      await refresh()
    },
    [projectId, refresh]
  )

  const deleteNote = useCallback(
    async (id: string) => {
      await window.devcenter.notes.delete(id)
      await refresh()
    },
    [refresh]
  )

  return {
    todos,
    notes,
    addTodo,
    toggleTodo,
    deleteTodo,
    addNote,
    deleteNote,
    refresh
  }
}
