import type { ClaudeAccessMode, ClaudeEffort, ClaudeModelId } from './types'

export const CLAUDE_MODELS: Array<{ id: ClaudeModelId; label: string; model: string }> = [
  { id: 'opus', label: 'Claude Opus', model: 'opus' },
  { id: 'sonnet', label: 'Claude Sonnet', model: 'sonnet' },
  { id: 'haiku', label: 'Claude Haiku', model: 'haiku' }
]

export const CLAUDE_EFFORTS: Array<{ id: ClaudeEffort; label: string }> = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra high' }
]

export const CLAUDE_ACCESS_MODES: Array<{ id: ClaudeAccessMode; label: string }> = [
  { id: 'supervised', label: 'Supervised' },
  { id: 'acceptEdits', label: 'Auto-accept edits' },
  { id: 'auto', label: 'Auto' },
  { id: 'full', label: 'Full access' }
]

export type ClaudeSdkPermissionMode = 'default' | 'acceptEdits' | 'auto' | 'bypassPermissions'

export function isClaudeModelId(value: unknown): value is ClaudeModelId {
  return value === 'opus' || value === 'sonnet' || value === 'haiku'
}

export function isClaudeEffort(value: unknown): value is ClaudeEffort {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh'
}

export function isClaudeAccessMode(value: unknown): value is ClaudeAccessMode {
  return value === 'supervised' || value === 'acceptEdits' || value === 'auto' || value === 'full'
}

export function claudeModelAlias(id: ClaudeModelId): string {
  return CLAUDE_MODELS.find((model) => model.id === id)?.model ?? 'opus'
}

export function claudePermission(access: ClaudeAccessMode): {
  permissionMode: ClaudeSdkPermissionMode
  allowDangerouslySkipPermissions: boolean
} {
  switch (access) {
    case 'supervised':
      return { permissionMode: 'default', allowDangerouslySkipPermissions: false }
    case 'acceptEdits':
      return { permissionMode: 'acceptEdits', allowDangerouslySkipPermissions: false }
    case 'auto':
      return { permissionMode: 'auto', allowDangerouslySkipPermissions: false }
    case 'full':
      return { permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true }
  }
}
