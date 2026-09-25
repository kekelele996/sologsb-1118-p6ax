import { createStore } from 'zustand/vanilla'
import type { Trench } from '@/types'
import { db, syncAll, syncDelete, syncPut } from '@/hooks/usePersistentStore'

export interface TrenchState {
  trenches: Trench[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (trench: Trench) => Promise<void>
  remove: (id: string) => Promise<void>
  setBackfilled: (id: string, backfilled: boolean) => Promise<void>
}

export const trenchStore = createStore<TrenchState>((set, get) => ({
  trenches: [],
  loaded: false,
  hydrate: async () => {
    const trenches = await syncAll<Trench>(db.trenches)
    trenches.sort((a, b) => `${a.area}${a.code}`.localeCompare(`${b.area}${b.code}`, 'zh-Hans-CN'))
    set({ trenches, loaded: true })
  },
  save: async (trench) => {
    await syncPut<Trench>(db.trenches, trench)
    await get().hydrate()
  },
  remove: async (id) => {
    await syncDelete<Trench>(db.trenches, id)
    await get().hydrate()
  },
  setBackfilled: async (id, backfilled) => {
    const target = get().trenches.find((item) => item.id === id)
    if (!target) return
    await syncPut<Trench>(db.trenches, { ...target, backfilled })
    await get().hydrate()
  }
}))
