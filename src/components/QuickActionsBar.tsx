import { ExternalLink, FileCode2, Play, Plus, Terminal } from 'lucide-react'
import type { QuickAction } from '../../shared/types'

interface QuickActionsBarProps {
  actions: QuickAction[]
  onRun: (action: QuickAction) => void
  onManage: () => void
}

function ActionIcon({ type }: { type: QuickAction['type'] }): React.JSX.Element {
  if (type === 'url') return <ExternalLink size={13} />
  if (type === 'program') return <Play size={13} />
  return <Terminal size={13} />
}

export function QuickActionsBar({
  actions,
  onRun,
  onManage
}: QuickActionsBarProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/8 px-6 py-2.5">
      <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-white/40">
        <FileCode2 size={12} />
        Quick
      </span>
      {actions.length === 0 ? (
        <span className="text-xs text-white/35">No quick actions yet</span>
      ) : (
        actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="btn btn-ghost text-xs"
            title={`${action.type}: ${action.target}`}
            onClick={() => onRun(action)}
          >
            <ActionIcon type={action.type} />
            {action.label}
          </button>
        ))
      )}
      <button type="button" className="btn btn-ghost text-xs" onClick={onManage} title="Manage quick actions">
        <Plus size={13} />
        Manage
      </button>
    </div>
  )
}
