import { useCallback, useEffect } from 'react'
import { useUiStore } from '../store/uiStore'
import type { Project } from '../../shared/types'

export function useProjects(): {
  projects: Project[]
  selectedProjectId: string | null
  selectedProject: Project | null
  refresh: () => Promise<void>
  selectProject: (id: string | null) => void
  upsert: (project: Project) => Promise<void>
  remove: (id: string) => Promise<void>
} {
  const projects = useUiStore((s) => s.projects)
  const selectedProjectId = useUiStore((s) => s.selectedProjectId)
  const setProjects = useUiStore((s) => s.setProjects)
  const selectProject = useUiStore((s) => s.selectProject)
  const setToast = useUiStore((s) => s.setToast)

  const refresh = useCallback(async () => {
    const list = await window.devcenter.projects.list()
    setProjects(list)
  }, [setProjects])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const upsert = useCallback(
    async (project: Project) => {
      const list = await window.devcenter.projects.upsert(project)
      setProjects(list)
      setToast(`Saved “${project.name}”`)
    },
    [setProjects, setToast]
  )

  const remove = useCallback(
    async (id: string) => {
      const list = await window.devcenter.projects.delete(id)
      setProjects(list)
      if (selectedProjectId === id) selectProject(null)
      setToast('Project removed')
    },
    [selectedProjectId, selectProject, setProjects, setToast]
  )

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null

  return {
    projects,
    selectedProjectId,
    selectedProject,
    refresh,
    selectProject,
    upsert,
    remove
  }
}
