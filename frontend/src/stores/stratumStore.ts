import { createStore } from 'zustand/vanilla'
import type { Stratum, UnitType } from '@/types'
import { db, syncAll, syncDelete, syncPut } from '@/hooks/usePersistentStore'
import { artifactStore } from '@/stores/artifactStore'
import { relationStore } from '@/stores/relationStore'
import { planStratumMerge, type MergeOutcome } from '@/utils/merge'

export interface StratumState {
  strata: Stratum[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (stratum: Stratum) => Promise<void>
  remove: (id: string) => Promise<void>
  bulkSetType: (ids: string[], type: UnitType) => Promise<void>
  /** 把 dropId 单位并入 keepId 单位：迁移出土物与层位关系并归并重复关系；校验不通过则原样返回原因 */
  merge: (keepId: string, dropId: string) => Promise<MergeOutcome>
}

export const stratumStore = createStore<StratumState>((set, get) => ({
  strata: [],
  loaded: false,
  hydrate: async () => {
    const strata = await syncAll<Stratum>(db.strata)
    strata.sort((a, b) => (a.topDepth === b.topDepth ? a.code.localeCompare(b.code, 'zh-Hans-CN') : a.topDepth - b.topDepth))
    set({ strata, loaded: true })
  },
  save: async (stratum) => {
    await syncPut<Stratum>(db.strata, stratum)
    await get().hydrate()
  },
  remove: async (id) => {
    await syncDelete<Stratum>(db.strata, id)
    await get().hydrate()
  },
  bulkSetType: async (ids, type) => {
    const targets = get().strata.filter((item) => ids.includes(item.id))
    await Promise.all(targets.map((item) => syncPut<Stratum>(db.strata, { ...item, type })))
    await get().hydrate()
  },
  merge: async (keepId, dropId) => {
    const outcome = planStratumMerge(
      get().strata,
      artifactStore.getState().artifacts,
      relationStore.getState().relations,
      keepId,
      dropId
    )
    if (!outcome.ok) return outcome
    const { plan } = outcome
    // 同一事务内完成迁移与删除，任一步失败则全部回滚，两个单位保持原样
    await db.transaction('rw', [db.strata, db.artifacts, db.relations], async () => {
      await db.artifacts.bulkPut(plan.movedArtifacts)
      await db.relations.bulkPut(plan.updatedRelations)
      await db.relations.bulkDelete(plan.removedRelationIds)
      await db.strata.delete(plan.drop.id)
    })
    await Promise.all([get().hydrate(), artifactStore.getState().hydrate(), relationStore.getState().hydrate()])
    return outcome
  }
}))
