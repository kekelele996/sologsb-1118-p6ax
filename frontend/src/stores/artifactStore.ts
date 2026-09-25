import { createStore } from 'zustand/vanilla'
import type { Artifact } from '@/types'
import { db, syncAll, syncDelete, syncPut } from '@/hooks/usePersistentStore'

export interface ArtifactState {
  artifacts: Artifact[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (artifact: Artifact) => Promise<void>
  remove: (id: string) => Promise<void>
  removeByStratum: (stratumId: string) => Promise<void>
}

export const artifactStore = createStore<ArtifactState>((set, get) => ({
  artifacts: [],
  loaded: false,
  hydrate: async () => {
    const artifacts = await syncAll<Artifact>(db.artifacts)
    artifacts.sort((a, b) => a.code.localeCompare(b.code, 'zh-Hans-CN', { numeric: true }))
    set({ artifacts, loaded: true })
  },
  save: async (artifact) => {
    await syncPut<Artifact>(db.artifacts, artifact)
    await get().hydrate()
  },
  remove: async (id) => {
    await syncDelete<Artifact>(db.artifacts, id)
    await get().hydrate()
  },
  removeByStratum: async (stratumId) => {
    const targets = get().artifacts.filter((item) => item.stratumId === stratumId)
    await Promise.all(targets.map((item) => syncDelete<Artifact>(db.artifacts, item.id)))
    await get().hydrate()
  }
}))
