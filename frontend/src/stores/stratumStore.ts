import { createStore } from 'zustand/vanilla'
import type { Artifact, Relation, Stratum, UnitType } from '@/types'
import { db, syncAll, syncDelete, syncPut } from '@/hooks/usePersistentStore'
import { planStratumMerge, type MergePlan } from '@/utils/merge'

export interface StratumState {
  strata: Stratum[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (stratum: Stratum) => Promise<void>
  remove: (id: string) => Promise<void>
  bulkSetType: (ids: string[], type: UnitType) => Promise<void>
  /** 合并两个地层单位：校验不通过时不写库，返回带原因的计划 */
  merge: (keepId: string, removeId: string) => Promise<MergePlan>
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
  merge: async (keepId, removeId) => {
    const [strata, artifacts, relations] = await Promise.all([
      syncAll<Stratum>(db.strata),
      syncAll<Artifact>(db.artifacts),
      syncAll<Relation>(db.relations)
    ])
    const plan = planStratumMerge({ strata, artifacts, relations, keepId, removeId })
    if (!plan.ok) return plan
    // 事务写入：出土物改属、关系迁移与归并、删除并入单位，任一步失败整体回滚
    await db.transaction('rw', [db.strata, db.artifacts, db.relations], async () => {
      await Promise.all(plan.movedArtifacts.map((item) => syncPut<Artifact>(db.artifacts, item)))
      await Promise.all(plan.updatedRelations.map((item) => syncPut<Relation>(db.relations, item)))
      await Promise.all(plan.removedRelationIds.map((id) => syncDelete<Relation>(db.relations, id)))
      await syncDelete<Stratum>(db.strata, removeId)
    })
    await get().hydrate()
    return plan
  }
}))
