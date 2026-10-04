import { useEffect, useRef, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import type { AppUpdatePhase, AppUpdateProgress, AppUpdateStatus } from '../../shared/types'

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unit]}`
}

export function UpdateSection(): React.JSX.Element {
  const [currentVersion, setCurrentVersion] = useState('…')
  const [packaged, setPackaged] = useState(true)
  const [phase, setPhase] = useState<AppUpdatePhase>('idle')
  const [remoteVersion, setRemoteVersion] = useState<string>()
  const [progress, setProgress] = useState<AppUpdateProgress>()
  const [message, setMessage] = useState<string>()
  const [devNote, setDevNote] = useState(false)
  const [checking, setChecking] = useState(false)
  const ignoreProgress = useRef(false)

  const applyStatus = (status: AppUpdateStatus): void => {
    setCurrentVersion(status.currentVersion)
    setPackaged(status.packaged)
    setPhase(status.phase)
    setRemoteVersion(status.version)
    setProgress(status.progress)
    setMessage(status.error)
    if (!status.packaged) setDevNote(true)
  }

  useEffect(() => {
    let alive = true
    void window.devcenter.updater.status().then((status) => {
      if (alive) applyStatus(status)
    })

    const offProgress = window.devcenter.updater.onProgress((next) => {
      if (ignoreProgress.current) return
      setPhase('downloading')
      setProgress(next)
      setMessage(undefined)
    })
    const offDownloaded = window.devcenter.updater.onDownloaded((info) => {
      ignoreProgress.current = false
      setPhase('downloaded')
      setRemoteVersion(info.version)
      setProgress((prev) => ({
        percent: 100,
        transferred: prev?.transferred ?? 0,
        total: prev?.total ?? 0,
        bytesPerSecond: 0
      }))
    })
    const offError = window.devcenter.updater.onError((error) => {
      ignoreProgress.current = false
      setPhase('error')
      setMessage(error.message)
    })

    return () => {
      alive = false
      offProgress()
      offDownloaded()
      offError()
    }
  }, [])

  const download = async (): Promise<void> => {
    ignoreProgress.current = false
    setPhase('downloading')
    setMessage(undefined)
    setProgress({ percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 })
    const result = await window.devcenter.updater.download()
    if (result.cancelled) {
      ignoreProgress.current = true
      setPhase('available')
      setProgress(undefined)
      return
    }
    if (!result.ok) {
      setPhase('error')
      setMessage(result.error ?? 'Download failed')
    }
  }

  const check = async (): Promise<void> => {
    ignoreProgress.current = false
    setChecking(true)
    setDevNote(false)
    setMessage(undefined)
    setProgress(undefined)
    try {
      const result = await window.devcenter.updater.check()
      setCurrentVersion(result.currentVersion)
      if (result.devOnly) {
        setDevNote(true)
        setPhase('idle')
        return
      }
      if (result.error) {
        setPhase('error')
        setMessage(result.error)
        return
      }
      if (result.available && result.version) {
        setRemoteVersion(result.version)
        setPhase('available')
        await download()
        return
      }
      setRemoteVersion(result.version)
      setPhase('idle')
      setMessage('This is the latest version')
    } finally {
      setChecking(false)
    }
  }

  const percent = Math.min(100, Math.max(0, progress?.percent ?? 0))
  const busy = checking || phase === 'downloading'

  return (
    <div className="space-y-3 rounded-lg border border-white/8 bg-surface-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Updates</p>
          <p className="mt-0.5 text-xs text-white/40">
            Version {currentVersion}
            {!packaged ? ' · development build' : ''}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost shrink-0 text-xs"
          disabled={busy}
          onClick={() => void check()}
        >
          <RefreshCw size={13} className={busy ? 'animate-spin' : undefined} />
          {phase === 'downloading' ? 'Downloading…' : checking ? 'Checking…' : 'Check for updates'}
        </button>
      </div>

      {devNote && (
        <p className="text-xs text-white/50">
          Update checks run in the installed app. Publish a GitHub release with electron-builder,
          then this build can download and install it.
        </p>
      )}

      {phase === 'downloading' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-white/55">
            <span>Downloading {remoteVersion ? `v${remoteVersion}` : 'update'}</span>
            <span>{percent.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
          {progress && progress.total > 0 && (
            <p className="text-xs text-white/35">
              {formatBytes(progress.transferred)} / {formatBytes(progress.total)}
              {progress.bytesPerSecond > 0 ? ` · ${formatBytes(progress.bytesPerSecond)}/s` : ''}
            </p>
          )}
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={() => {
              ignoreProgress.current = true
              setPhase('available')
              setProgress(undefined)
              void window.devcenter.updater.cancel()
            }}
          >
            Cancel download
          </button>
        </div>
      )}

      {phase === 'available' && remoteVersion && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-white/70">Version {remoteVersion} is ready to download</p>
          <button type="button" className="btn btn-primary text-xs" onClick={() => void download()}>
            <Download size={13} />
            Download
          </button>
        </div>
      )}

      {phase === 'downloaded' && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-white/70">
            Version {remoteVersion ?? 'update'} downloaded. Restart to install it.
          </p>
          <button
            type="button"
            className="btn btn-primary text-xs"
            onClick={() => void window.devcenter.updater.install()}
          >
            Install and restart
          </button>
        </div>
      )}

      {phase === 'error' && message && <p className="text-xs text-rose-300">{message}</p>}

      {phase === 'idle' && message && !devNote && <p className="text-xs text-white/55">{message}</p>}
    </div>
  )
}
