import {
  GitBranch,
  Play,
  Square,
  AlertTriangle,
  Circle,
  FolderOpen,
  Pencil,
  Unplug
} from 'lucide-react'
import type { GitStatus, PortStatus, ProcessInfo, Project } from '../../shared/types'
import { folderLabel, getProjectFolders } from '../../shared/projectPaths'

interface ProjectCardProps {
  project: Project
  selected: boolean
  processes: ProcessInfo[]
  gitStatuses: GitStatus[]
  ports: PortStatus[]
  onSelect: () => void
  onLaunch: () => void
  onStop: () => void
  onEdit: () => void
  onForceFree: (port: number) => void
}

export function ProjectCard({
  project,
  selected,
  processes,
  gitStatuses,
  ports,
  onSelect,
  onLaunch,
  onStop,
  onEdit,
  onForceFree
}: ProjectCardProps): React.JSX.Element {
  const running = processes.length > 0
  const busyPorts = ports.filter((p) => p.inUse)
  const folders = getProjectFolders(project)
  const okGit = gitStatuses.filter((g) => !g.error)
  const folderSummary =
    folders.length === 0
      ? 'No folders configured'
      : folders.length === 1
        ? folders[0]
        : `${folders.length} folders · ${folders.map(folderLabel).join(', ')}`

  return (
    <article
      onClick={onSelect}
      className={[
        'group relative cursor-pointer rounded-xl border p-4 shadow-panel transition',
        selected
          ? 'border-accent/40 bg-accent-muted/40'
          : 'border-white/8 bg-surface-900/70 hover:border-white/20 hover:bg-surface-800/80'
      ].join(' ')}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <Circle
              className={running ? 'fill-accent text-accent' : 'fill-white/20 text-white/20'}
              size={10}
            />
            <h3 className="truncate font-display text-lg font-semibold tracking-tight">
              {project.name}
            </h3>
          </div>
          <p className="flex items-center gap-1 truncate text-xs text-white/45" title={folders.join('\n')}>
            <FolderOpen size={12} className="shrink-0" />
            {folderSummary}
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost btn opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          title="Edit project"
        >
          <Pencil size={14} />
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        {okGit.map((git) => (
          <span
            key={git.path}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-white/70"
            title={git.path}
          >
            <GitBranch size={12} className="shrink-0" />
            {okGit.length > 1 && (
              <span className="truncate font-medium text-white/45">{git.label}</span>
            )}
            <span className="truncate">{git.branch}</span>
            {git.dirtyCount > 0 && (
              <span className="shrink-0 text-warn">· {git.dirtyCount} dirty</span>
            )}
            {(git.ahead > 0 || git.behind > 0) && (
              <span className="shrink-0 text-white/45">
                · ↑{git.ahead} ↓{git.behind}
              </span>
            )}
          </span>
        ))}
        {running && (
          <span className="rounded-md bg-accent/15 px-2 py-1 text-accent">
            {processes.length} active
          </span>
        )}
      </div>

      {busyPorts.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {busyPorts.map((p) => (
            <div
              key={p.port}
              className="flex items-center justify-between gap-2 rounded-md border border-warn/30 bg-warn/10 px-2 py-1.5 text-xs text-warn"
            >
              <span className="inline-flex items-center gap-1">
                <AlertTriangle size={12} />
                Port {p.port} in use{p.pid ? ` (PID ${p.pid})` : ''}
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded bg-warn/20 px-2 py-0.5 text-[11px] font-medium hover:bg-warn/30"
                onClick={(e) => {
                  e.stopPropagation()
                  onForceFree(p.port)
                }}
              >
                <Unplug size={11} />
                Force Free
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        {!running ? (
          <button
            type="button"
            className="btn btn-primary flex-1"
            onClick={(e) => {
              e.stopPropagation()
              onLaunch()
            }}
          >
            <Play size={14} />
            Launch
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-danger flex-1"
            onClick={(e) => {
              e.stopPropagation()
              onStop()
            }}
          >
            <Square size={14} />
            Stop
          </button>
        )}
      </div>
    </article>
  )
}
