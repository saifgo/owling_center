import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import { createRequire } from 'module'
import type {
  ClaudeApprovalState,
  ClaudeMessageKind,
  ClaudeThread,
  ClaudeThreadMessage,
  SessionNote,
  TodoItem
} from '../../shared/types'

const require = createRequire(__filename)

let db: SqlJsDatabase | null = null
let dbPath = ''

function persist(): void {
  if (!db || !dbPath) return
  const data = db.export()
  const buffer = Buffer.from(data)
  writeFileSync(dbPath, buffer)
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

function persistSoon(): void {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    persist()
  }, 400)
}

function persistNow(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  persist()
}

function resolveWasm(file: string): string {
  try {
    return require.resolve(`sql.js/dist/${file}`)
  } catch {
    return join(dirname(require.resolve('sql.js/package.json')), 'dist', file)
  }
}

export async function initDb(): Promise<void> {
  if (db) return
  const SQL = await initSqlJs({
    locateFile: (file) => resolveWasm(file)
  })

  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  dbPath = join(dir, 'devcenter.sqlite')

  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      text TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS session_notes (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      text TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS claude_threads (
      projectId TEXT PRIMARY KEY,
      sessionId TEXT,
      cwd TEXT,
      updatedAt TEXT NOT NULL
    );
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS claude_messages (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      seq INTEGER NOT NULL,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      toolName TEXT,
      approval TEXT,
      createdAt TEXT NOT NULL
    );
  `)
  persist()
}

function requireDb(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized')
  return db
}

function mapTodo(row: Record<string, unknown>): TodoItem {
  return {
    id: String(row.id),
    projectId: String(row.projectId),
    text: String(row.text),
    completed: Boolean(row.completed),
    createdAt: String(row.createdAt)
  }
}

function mapNote(row: Record<string, unknown>): SessionNote {
  return {
    id: String(row.id),
    projectId: String(row.projectId),
    text: String(row.text),
    createdAt: String(row.createdAt)
  }
}

function queryAll(sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const database = requireDb()
  const stmt = database.prepare(sql)
  stmt.bind(params as never[])
  const rows: Record<string, unknown>[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as Record<string, unknown>)
  }
  stmt.free()
  return rows
}

export function listTodos(projectId?: string): TodoItem[] {
  const rows = projectId
    ? queryAll(
        'SELECT * FROM todos WHERE projectId = ? ORDER BY createdAt DESC',
        [projectId]
      )
    : queryAll('SELECT * FROM todos ORDER BY createdAt DESC')
  return rows.map(mapTodo)
}

export function addTodo(projectId: string, text: string): TodoItem {
  const item: TodoItem = {
    id: randomUUID(),
    projectId,
    text: text.trim(),
    completed: false,
    createdAt: new Date().toISOString()
  }
  requireDb().run(
    'INSERT INTO todos (id, projectId, text, completed, createdAt) VALUES (?, ?, ?, ?, ?)',
    [item.id, item.projectId, item.text, 0, item.createdAt]
  )
  persist()
  return item
}

export function toggleTodo(id: string): TodoItem | null {
  const rows = queryAll('SELECT * FROM todos WHERE id = ?', [id])
  if (rows.length === 0) return null
  const row = rows[0]
  const completed = row.completed ? 0 : 1
  requireDb().run('UPDATE todos SET completed = ? WHERE id = ?', [completed, id])
  persist()
  return {
    id: String(row.id),
    projectId: String(row.projectId),
    text: String(row.text),
    completed: Boolean(completed),
    createdAt: String(row.createdAt)
  }
}

export function deleteTodo(id: string): boolean {
  requireDb().run('DELETE FROM todos WHERE id = ?', [id])
  persist()
  return true
}

export function listSessionNotes(projectId?: string): SessionNote[] {
  const rows = projectId
    ? queryAll(
        'SELECT * FROM session_notes WHERE projectId = ? ORDER BY createdAt DESC',
        [projectId]
      )
    : queryAll('SELECT * FROM session_notes ORDER BY createdAt DESC')
  return rows.map(mapNote)
}

export function addSessionNote(projectId: string, text: string): SessionNote {
  const note: SessionNote = {
    id: randomUUID(),
    projectId,
    text: text.trim(),
    createdAt: new Date().toISOString()
  }
  requireDb().run(
    'INSERT INTO session_notes (id, projectId, text, createdAt) VALUES (?, ?, ?, ?)',
    [note.id, note.projectId, note.text, note.createdAt]
  )
  persist()
  return note
}

export function deleteSessionNote(id: string): boolean {
  requireDb().run('DELETE FROM session_notes WHERE id = ?', [id])
  persist()
  return true
}

export function replaceAllTodos(items: TodoItem[]): void {
  const database = requireDb()
  database.run('DELETE FROM todos')
  const insert = database.prepare(
    'INSERT INTO todos (id, projectId, text, completed, createdAt) VALUES (?, ?, ?, ?, ?)'
  )
  for (const item of items) {
    insert.run([
      item.id,
      item.projectId,
      item.text,
      item.completed ? 1 : 0,
      item.createdAt || new Date().toISOString()
    ])
  }
  insert.free()
  persist()
}

export function replaceAllSessionNotes(notes: SessionNote[]): void {
  const database = requireDb()
  database.run('DELETE FROM session_notes')
  const insert = database.prepare(
    'INSERT INTO session_notes (id, projectId, text, createdAt) VALUES (?, ?, ?, ?)'
  )
  for (const note of notes) {
    insert.run([
      note.id,
      note.projectId,
      note.text,
      note.createdAt || new Date().toISOString()
    ])
  }
  insert.free()
  persist()
}

const CLAUDE_KINDS = new Set<ClaudeMessageKind>([
  'user',
  'assistant',
  'thinking',
  'tool',
  'approval',
  'status',
  'error'
])

function mapClaudeMessage(row: Record<string, unknown>): ClaudeThreadMessage {
  const kind = String(row.kind)
  const approval = row.approval ? String(row.approval) : undefined
  return {
    id: String(row.id),
    projectId: String(row.projectId),
    seq: Number(row.seq) || 0,
    kind: CLAUDE_KINDS.has(kind as ClaudeMessageKind) ? (kind as ClaudeMessageKind) : 'status',
    text: String(row.text ?? ''),
    toolName: row.toolName ? String(row.toolName) : undefined,
    approval:
      approval === 'pending' || approval === 'allowed' || approval === 'denied'
        ? approval
        : undefined,
    createdAt: String(row.createdAt)
  }
}

export function getClaudeThread(projectId: string, running = false): ClaudeThread {
  const threads = queryAll('SELECT * FROM claude_threads WHERE projectId = ?', [projectId])
  const messages = queryAll(
    'SELECT * FROM claude_messages WHERE projectId = ? ORDER BY seq ASC, createdAt ASC',
    [projectId]
  ).map(mapClaudeMessage)
  const thread = threads[0]
  return {
    projectId,
    sessionId: thread?.sessionId ? String(thread.sessionId) : null,
    cwd: thread?.cwd ? String(thread.cwd) : '',
    running,
    messages
  }
}

export function saveClaudeSession(projectId: string, sessionId: string, cwd: string): void {
  const now = new Date().toISOString()
  const existing = queryAll('SELECT projectId FROM claude_threads WHERE projectId = ?', [projectId])
  if (existing.length === 0) {
    requireDb().run(
      'INSERT INTO claude_threads (projectId, sessionId, cwd, updatedAt) VALUES (?, ?, ?, ?)',
      [projectId, sessionId, cwd, now]
    )
  } else {
    requireDb().run(
      'UPDATE claude_threads SET sessionId = ?, cwd = ?, updatedAt = ? WHERE projectId = ?',
      [sessionId, cwd, now, projectId]
    )
  }
  persistNow()
}

export function insertClaudeMessage(message: ClaudeThreadMessage): ClaudeThreadMessage {
  requireDb().run(
    `INSERT INTO claude_messages
      (id, projectId, seq, kind, text, toolName, approval, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      message.id,
      message.projectId,
      message.seq,
      message.kind,
      message.text,
      message.toolName ?? null,
      message.approval ?? null,
      message.createdAt
    ]
  )
  persistNow()
  return message
}

export function nextClaudeSeq(projectId: string): number {
  const rows = queryAll('SELECT MAX(seq) AS seq FROM claude_messages WHERE projectId = ?', [
    projectId
  ])
  return Number(rows[0]?.seq ?? 0) + 1
}

export function updateClaudeMessage(
  id: string,
  patch: { text?: string; toolName?: string; approval?: ClaudeApprovalState },
  immediate = false
): void {
  const rows = queryAll('SELECT * FROM claude_messages WHERE id = ?', [id])
  if (rows.length === 0) return
  const row = rows[0]
  const text = patch.text ?? String(row.text ?? '')
  const toolName =
    patch.toolName === undefined ? (row.toolName ? String(row.toolName) : null) : patch.toolName
  const approval =
    patch.approval === undefined ? (row.approval ? String(row.approval) : null) : patch.approval
  requireDb().run('UPDATE claude_messages SET text = ?, toolName = ?, approval = ? WHERE id = ?', [
    text,
    toolName,
    approval,
    id
  ])
  if (immediate) persistNow()
  else persistSoon()
}

export function clearClaudeThread(projectId: string): void {
  const database = requireDb()
  database.run('DELETE FROM claude_messages WHERE projectId = ?', [projectId])
  database.run('DELETE FROM claude_threads WHERE projectId = ?', [projectId])
  persistNow()
}

export function closeDb(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (db) {
    persist()
    db.close()
    db = null
  }
}
