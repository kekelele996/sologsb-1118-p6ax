import { computed, type Ref } from 'vue'
import type { Relation, Stratum } from '@/types'
import { isDepthInverted, stratumThickness } from '@/types'

export interface StratumOrderResult {
  /** 按深度上界升序的序列（浅 → 深） */
  ordered: Stratum[]
  /** 层序倒置的单位（上界 > 下界） */
  inverted: Stratum[]
  /** 单位号在同一探方内重复的单位号列表 */
  duplicateCodes: string[]
  /** 与层位关系矛盾的告警（如 A 叠压 B 但 A 更深） */
  conflicts: string[]
  /** 单位号 → 序号（1 起） */
  indexOf: Map<string, number>
}

/**
 * 按深度与层位关系计算地层序列：
 * - 主序按距地表上界深度升序；
 * - 若存在「A 叠压/打破 B 但 A 的上界比 B 更深」的情况，则给出矛盾告警；
 * - 同时返回倒置单位与重复单位号，供编目表即时提示。
 */
export function useStratumOrder(strata: Ref<Stratum[]>, relations: Ref<Relation[]>): { result: Ref<StratumOrderResult> } {
  const result = computed<StratumOrderResult>(() => {
    const ordered = [...strata.value].sort((a, b) => {
      if (a.topDepth !== b.topDepth) return a.topDepth - b.topDepth
      return a.bottomDepth - b.bottomDepth
    })
    const indexOf = new Map<string, number>()
    ordered.forEach((item, index) => indexOf.set(item.id, index + 1))

    const inverted = strata.value.filter((item) => isDepthInverted(item))

    const byTrench = new Map<string, Map<string, number>>()
    strata.value.forEach((item) => {
      const bucket = byTrench.get(item.trenchId) ?? new Map<string, number>()
      const key = item.code.trim().toUpperCase()
      bucket.set(key, (bucket.get(key) ?? 0) + 1)
      byTrench.set(item.trenchId, bucket)
    })
    const duplicateCodes: string[] = []
    byTrench.forEach((bucket) => {
      bucket.forEach((count, code) => {
        if (count > 1) duplicateCodes.push(code)
      })
    })

    const conflicts: string[] = []
    relations.value.forEach((relation) => {
      if (relation.type === '共存') return
      const a = strata.value.find((item) => item.id === relation.unitAId)
      const b = strata.value.find((item) => item.id === relation.unitBId)
      if (!a || !b) return
      if (a.topDepth > b.topDepth) {
        conflicts.push(
          `${a.code} ${relation.type} ${b.code}，但 ${a.code} 上界深度（${a.topDepth} m）大于 ${b.code}（${b.topDepth} m），层位关系与深度矛盾`
        )
      }
    })

    return { ordered, inverted, duplicateCodes, conflicts, indexOf }
  })

  return { result }
}

/** 供编目表展示：单位厚度文本 */
export function thicknessText(stratum: Stratum): string {
  return `${stratumThickness(stratum)} m`
}
