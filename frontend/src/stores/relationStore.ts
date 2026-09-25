import { createStore } from 'zustand/vanilla'
import type { Relation } from '@/types'
import { db, syncAll, syncDelete, syncPut } from '@/hooks/usePersistentStore'

export interface RelationState {
  relations: Relation[]
  loaded: boolean
  hydrate: () => Promise<void>
  /** 保存前由页面做环路检测，store 只负责写入 */
  save: (relation: Relation) => Promise<void>
  remove: (id: string) => Promise<void>
  removeByStratum: (stratumId: string) => Promise<void>
}

export const relationStore = createStore<RelationState>((set, get) => ({
  relations: [],
  loaded: false,
  hydrate: async () => {
    const relations = await syncAll<Relation>(db.relations)
    relations.sort((a, b) => a.id.localeCompare(b.id))
    set({ relations, loaded: true })
  },
  save: async (relation) => {
    await syncPut<Relation>(db.relations, relation)
    await get().hydrate()
  },
  remove: async (id) => {
    await syncDelete<Relation>(db.relations, id)
    await get().hydrate()
  },
  removeByStratum: async (stratumId) => {
    const targets = get().relations.filter((item) => item.unitAId === stratumId || item.unitBId === stratumId)
    await Promise.all(targets.map((item) => syncDelete<Relation>(db.relations, item.id)))
    await get().hydrate()
  }
}))
