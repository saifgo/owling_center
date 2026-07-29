import { ChevronDown, ChevronUp, Eraser, Skull, Terminal } from 'lucide-react'
import type { LogChunk, ProcessInfo, Project } from '../../shared/types'

interface LogDrawerProps {
  open: boolean
  onToggle: () => void
  logs: LogChunk[]
  processes: ProcessInfo[]
  projects: Project[]
  onStopAll: () => void
  onClear: () => void
}

function colorForStream(stream: LogChunk['stream']): string {
  if (stream === 'stderr') return 'text-danger'
  if (stream === 'system') return 'text-warn'
  return 'text-surface-100'
}

export function LogDrawer({
  open,
  onToggle,
  logs,
  processes,
  projects,
  onStopAll,
  onClear
}: LogDrawerProps): React.JSX.Element {
  const projectName = (id: string): string =>
    projects.find((p) => p.id === id)?.name ?? id

  return (
    <div
      className={[
        'shrink-0 border-t border-white/10 bg-surface-950/95 backdrop-blur transition-all',
        open ? 'h-64' : 'h-11'
      ].join(' ')}
    >
      <div className="flex h-11 items-center justify-between gap-3 border-b border-white/8 px-4">
        <button
          type="button"
          className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
          onClick={onToggle}
        >
          <Terminal size={15} className="text-accent" />
          Process logs
          {processes.length > 0 && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] text-accent">
              {processes.length} running
            </span>
          )}
          {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-ghost text-xs" onClick={onClear}>
            <Eraser size={13} />
            Clear
          </button>
          <button
            type="button"
            className="btn btn-danger text-xs"
            onClick={onStopAll}
            disabled={processes.length === 0}
          >
            <Skull size={13} />
            Stop All Services
          </button>
        </div>
      </div>

      {open && (
        <div className="h-[calc(100%-2.75rem)] overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
          {logs.length === 0 ? (
            <p className="text-white/35">No output yet. Launch a project to stream logs here.</p>
          ) : (
            logs.map((chunk, i) => (
              <div key={`${chunk.timestamp}-${i}`} className={colorForStream(chunk.stream)}>
                <span className="text-white/30">
                  [{new Date(chunk.timestamp).toLocaleTimeString()}]
                </span>{' '}
                <span className="text-accent/80">{projectName(chunk.projectId)}</span>
                <span className="text-white/40">/{chunk.processName}</span>{' '}
                <span className="whitespace-pre-wrap">{chunk.text}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
