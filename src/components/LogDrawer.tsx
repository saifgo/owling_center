import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Eraser,
  PanelBottom,
  PanelRight,
  Skull,
  Square,
  Terminal
} from 'lucide-react'
import type { LogDock } from '../store/uiStore'
import type { LogChunk, ProcessInfo, Project } from '../../shared/types'

interface LogDrawerProps {
  open: boolean
  dock: LogDock
  size: number
  onToggle: () => void
  onDock: (dock: LogDock) => void
  onResize: (size: number) => void
  logs: LogChunk[]
  processes: ProcessInfo[]
  projects: Project[]
  onStopAll: () => void
  onStopProcess: (processId: string) => void
  onClear: () => void
  onClearProcess: (processId: string) => void
}

interface ProcessSection {
  id: string
  projectId: string
  processName: string
  running: boolean
  pid?: number
  logs: LogChunk[]
}

const PANE_TONES = ['bg-accent', 'bg-sky-400', 'bg-amber-400', 'bg-violet-400', 'bg-rose-400']

function colorForStream(stream: LogChunk['stream']): string {
  if (stream === 'stderr') return 'text-danger'
  if (stream === 'system') return 'text-warn'
  return 'text-surface-100'
}

function clampSize(dock: LogDock, size: number): number {
  if (dock === 'bottom') {
    const max = Math.max(180, window.innerHeight - 140)
    return Math.round(Math.min(Math.max(size, 160), max))
  }
  const max = Math.max(340, window.innerWidth - 420)
  return Math.round(Math.min(Math.max(size, 300), max))
}

function buildSections(logs: LogChunk[], processes: ProcessInfo[]): ProcessSection[] {
  const order: string[] = []
  const map = new Map<string, ProcessSection>()

  const ensure = (
    id: string,
    projectId: string,
    processName: string,
    running: boolean,
    pid?: number
  ): ProcessSection => {
    const existing = map.get(id)
    if (existing) {
      if (processName) existing.processName = processName
      if (running) {
        existing.running = true
        existing.pid = pid
      }
      return existing
    }
    const section: ProcessSection = { id, projectId, processName, running, pid, logs: [] }
    map.set(id, section)
    order.push(id)
    return section
  }

  for (const proc of processes) {
    ensure(proc.id, proc.projectId, proc.name, true, proc.pid)
  }
  for (const chunk of logs) {
    ensure(chunk.processId, chunk.projectId, chunk.processName, false).logs.push(chunk)
  }

  return order.map((id) => map.get(id)!)
}

function LogLines({ logs }: { logs: LogChunk[] }): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    const el = scroller.current
    if (!el || !stick.current) return
    el.scrollTop = el.scrollHeight
  }, [logs])

  return (
    <div
      ref={scroller}
      className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed"
      onScroll={() => {
        const el = scroller.current
        if (!el) return
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
      }}
    >
      {logs.length === 0 ? (
        <p className="text-white/35">Waiting for output…</p>
      ) : (
        logs.map((chunk, i) => (
          <div key={`${chunk.timestamp}-${chunk.processId}-${i}`} className={colorForStream(chunk.stream)}>
            <span className="text-white/30">[{new Date(chunk.timestamp).toLocaleTimeString()}]</span>{' '}
            <span className="whitespace-pre-wrap break-all">{chunk.text}</span>
          </div>
        ))
      )}
    </div>
  )
}

function ProcessPane({
  section,
  projectName,
  tone,
  onStop,
  onClear
}: {
  section: ProcessSection
  projectName: string
  tone: string
  onStop: () => void
  onClear: () => void
}): React.JSX.Element {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-black/20">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-white/8 px-2.5">
        <span className={['h-1.5 w-1.5 shrink-0 rounded-full', tone, section.running ? '' : 'opacity-35'].join(' ')} />
        <p className="min-w-0 flex-1 truncate text-xs text-white/80">
          <span className="font-medium text-white">{section.processName}</span>
          <span className="text-white/35"> · {projectName}</span>
          {section.running && section.pid && section.pid > 0 && (
            <span className="text-white/30"> · {section.pid}</span>
          )}
          {!section.running && <span className="text-white/30"> · exited</span>}
        </p>
        <button
          type="button"
          className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
          title={`Clear ${section.processName}`}
          onClick={onClear}
        >
          <Eraser size={12} />
        </button>
        <button
          type="button"
          className="rounded p-1 text-white/40 hover:bg-danger/20 hover:text-danger disabled:pointer-events-none disabled:opacity-30"
          title={`Stop ${section.processName}`}
          onClick={onStop}
          disabled={!section.running}
        >
          <Square size={12} />
        </button>
      </header>
      <LogLines logs={section.logs} />
    </section>
  )
}

export function LogDrawer({
  open,
  dock,
  size,
  onToggle,
  onDock,
  onResize,
  logs,
  processes,
  projects,
  onStopAll,
  onStopProcess,
  onClear,
  onClearProcess
}: LogDrawerProps): React.JSX.Element {
  const bodyRef = useRef<HTMLDivElement>(null)
  const orderRef = useRef<string[]>([])
  const [weights, setWeights] = useState<number[]>([])
  const appliedSize = clampSize(dock, size)

  const projectName = (id: string): string => projects.find((p) => p.id === id)?.name ?? id

  const sections = useMemo(() => {
    const built = buildSections(logs, processes)
    const byId = new Map(built.map((section) => [section.id, section]))
    const order = orderRef.current.filter((id) => byId.has(id))
    for (const section of built) {
      if (!order.includes(section.id)) order.push(section.id)
    }
    orderRef.current = order
    return order.map((id) => byId.get(id)!)
  }, [logs, processes])

  useEffect(() => {
    setWeights(sections.map(() => 1))
  }, [sections.length])

  const startPanelResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    const start = dock === 'bottom' ? event.clientY : event.clientX
    const startSize = appliedSize
    const previousCursor = document.body.style.cursor
    const previousSelect = document.body.style.userSelect
    document.body.style.cursor = dock === 'bottom' ? 'ns-resize' : 'ew-resize'
    document.body.style.userSelect = 'none'

    const move = (ev: PointerEvent): void => {
      const current = dock === 'bottom' ? ev.clientY : ev.clientX
      onResize(startSize + (start - current))
    }
    const up = (): void => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousSelect
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startPaneResize = (index: number, event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    const container = bodyRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const span = dock === 'bottom' ? rect.width : rect.height
    if (span <= 0) return
    const start = dock === 'bottom' ? event.clientX : event.clientY
    const startWeights = weights.length === sections.length ? weights.slice() : sections.map(() => 1)
    const sum = startWeights.reduce((total, value) => total + value, 0)

    const move = (ev: PointerEvent): void => {
      const current = dock === 'bottom' ? ev.clientX : ev.clientY
      const delta = ((current - start) / span) * sum
      const next = startWeights.slice()
      const min = 0.4
      let a = startWeights[index] + delta
      let b = startWeights[index + 1] - delta
      if (a < min) {
        b -= min - a
        a = min
      }
      if (b < min) {
        a -= min - b
        b = min
      }
      next[index] = a
      next[index + 1] = b
      setWeights(next)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const dockButtons = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={[
          'inline-flex h-7 w-7 items-center justify-center rounded-md border',
          dock === 'bottom'
            ? 'border-accent/40 bg-accent/15 text-accent'
            : 'border-transparent text-white/45 hover:bg-white/10 hover:text-white'
        ].join(' ')}
        title="Dock to bottom"
        aria-label="Dock to bottom"
        aria-pressed={dock === 'bottom'}
        onClick={() => onDock('bottom')}
      >
        <PanelBottom size={15} />
      </button>
      <button
        type="button"
        className={[
          'inline-flex h-7 w-7 items-center justify-center rounded-md border',
          dock === 'right'
            ? 'border-accent/40 bg-accent/15 text-accent'
            : 'border-transparent text-white/45 hover:bg-white/10 hover:text-white'
        ].join(' ')}
        title="Dock to the right"
        aria-label="Dock to the right"
        aria-pressed={dock === 'right'}
        onClick={() => onDock('right')}
      >
        <PanelRight size={15} />
      </button>
    </div>
  )

  if (!open && dock === 'right') {
    return (
      <div className="flex w-11 shrink-0 flex-col items-center gap-3 self-stretch border-l border-white/10 bg-surface-950/95 py-3">
        <button
          type="button"
          className="inline-flex flex-1 flex-col items-center gap-3 text-white/70 hover:text-white"
          onClick={onToggle}
          title="Show process logs"
        >
          <Terminal size={15} className="text-accent" />
          <span className="text-[11px] tracking-wide [writing-mode:vertical-rl]">Process logs</span>
          {processes.length > 0 && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] text-accent">
              {processes.length}
            </span>
          )}
        </button>
      </div>
    )
  }

  const split = sections.length >= 2

  return (
    <div
      className={[
        'relative flex shrink-0 flex-col overflow-hidden bg-surface-950/95 backdrop-blur',
        dock === 'bottom' ? 'border-t border-white/10' : 'self-stretch border-l border-white/10'
      ].join(' ')}
      style={
        dock === 'bottom'
          ? { height: open ? appliedSize : 44 }
          : { width: appliedSize }
      }
    >
      {open && (
        <div
          role="separator"
          aria-orientation={dock === 'bottom' ? 'horizontal' : 'vertical'}
          aria-label="Resize process logs"
          title="Drag to resize. Double-click to reset."
          className={[
            'absolute z-10 touch-none',
            dock === 'bottom'
              ? 'inset-x-0 top-0 h-1.5 -translate-y-1/2 cursor-ns-resize'
              : 'inset-y-0 left-0 w-1.5 -translate-x-1/2 cursor-ew-resize'
          ].join(' ')}
          onPointerDown={startPanelResize}
          onDoubleClick={() => onResize(dock === 'bottom' ? 280 : 440)}
        >
          <span
            className={[
              'absolute bg-white/15 transition hover:bg-accent/70',
              dock === 'bottom'
                ? 'left-1/2 top-1/2 h-1 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full'
                : 'left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full'
            ].join(' ')}
          />
        </div>
      )}

      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-white/8 px-3">
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-2 text-sm text-white/70 hover:text-white"
          onClick={onToggle}
        >
          <Terminal size={15} className="shrink-0 text-accent" />
          <span className="truncate">Process logs</span>
          {processes.length > 0 && (
            <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[11px] text-accent">
              {processes.length} running
            </span>
          )}
          {open ? <ChevronDown size={14} className="shrink-0" /> : <ChevronUp size={14} className="shrink-0" />}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {dockButtons}
          <button type="button" className="btn btn-ghost px-2 text-xs" onClick={onClear} title="Clear logs">
            <Eraser size={13} />
            {dock === 'bottom' && <span>Clear</span>}
          </button>
          <button
            type="button"
            className="btn btn-danger px-2 text-xs"
            onClick={onStopAll}
            disabled={processes.length === 0}
            title="Stop all services"
          >
            <Skull size={13} />
            {dock === 'bottom' && <span>Stop all</span>}
          </button>
        </div>
      </div>

      {open && (
        <div
          ref={bodyRef}
          className={[
            'flex min-h-0 flex-1 overflow-hidden',
            dock === 'bottom' ? 'flex-row' : 'flex-col'
          ].join(' ')}
        >
          {sections.length === 0 ? (
            <p className="px-3 py-2 font-mono text-[11px] text-white/35">
              No output yet. Launch a project to stream logs here.
            </p>
          ) : (
            sections.map((section, index) => (
              <div
                key={section.id}
                className={['flex min-h-0 min-w-0', dock === 'bottom' ? 'flex-row' : 'flex-col'].join(' ')}
                style={{ flex: weights[index] ?? 1 }}
              >
                {split && index > 0 && (
                  <div
                    role="separator"
                    aria-orientation={dock === 'bottom' ? 'vertical' : 'horizontal'}
                    aria-label="Resize process section"
                    className={[
                      'shrink-0 bg-white/10 touch-none hover:bg-accent/70',
                      dock === 'bottom' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'
                    ].join(' ')}
                    onPointerDown={(event) => startPaneResize(index - 1, event)}
                  />
                )}
                <ProcessPane
                  section={section}
                  projectName={projectName(section.projectId)}
                  tone={PANE_TONES[index % PANE_TONES.length]}
                  onStop={() => onStopProcess(section.id)}
                  onClear={() => onClearProcess(section.id)}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
