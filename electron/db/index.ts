import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import { createRequire } from 'module'
import type { SessionNote, TodoItem } from '../../shared/types'

const require = createRequire(__filename)

let db: SqlJsDatabase | null = null
let dbPath = ''

function persist(): void {
  if (!db || !dbPath) return
  const data = db.export()
  const buffer = Buffer.from(data)
  writeFileSync(dbPath, buffer)
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

export function closeDb(): void {
  if (db) {
    persist()
    db.close()
    db = null
  }
}
