import type { Artifact, Relation, Stratum } from '@/types'

/** 合并计划输入 */
export interface MergePlanInput {
  strata: Stratum[]
  artifacts: Artifact[]
  relations: Relation[]
  /** 保留单位 id（合并后编目以此编号为准） */
  keepId: string
  /** 并入单位 id（出土物与层位关系迁出后删除） */
  removeId: string
}

/** 合并计划：校验不通过时 reasons 说明原因，且不应产生任何写入 */
export interface MergePlan {
  ok: boolean
  /** 拒绝合并的原因（ok 为 false 时非空） */
  reasons: string[]
  keep: Stratum | null
  remove: Stratum | null
  /** 需改属到保留单位的出土物（stratumId 已改写） */
  movedArtifacts: Artifact[]
  /** 迁移后需要写入的关系（并入单位 id 已改写为保留单位 id） */
  updatedRelations: Relation[]
  /** 重复归并后需要删除的关系 id */
  removedRelationIds: string[]
}

/** 单位深度区间（兼容层序倒置的历史数据） */
function depthRange(stratum: Stratum): [number, number] {
  return [Math.min(stratum.topDepth, stratum.bottomDepth), Math.max(stratum.topDepth, stratum.bottomDepth)]
}

function relationKey(relation: Pick<Relation, 'unitAId' | 'type' | 'unitBId'>): string {
  return `${relation.unitAId}|${relation.type}|${relation.unitBId}`
}

/**
 * 制定地层单位合并计划（纯函数，不写库）：
 * - 仅允许同一探方内两个不同单位合并；
 * - 若迁移后关系两端变成同一单位、出现跨探方引用或深度矛盾，计划不通过并在 reasons 说明原因，两个单位保持原样；
 * - 通过后：并入单位的出土物改属保留单位，层位关系整体迁移，重复关系按（单位 A、类型、单位 B）归并。
 */
export function planStratumMerge({ strata, artifacts, relations, keepId, removeId }: MergePlanInput): MergePlan {
  const keep = strata.find((item) => item.id === keepId) ?? null
  const remove = strata.find((item) => item.id === removeId) ?? null
  const plan: MergePlan = {
    ok: false,
    reasons: [],
    keep,
    remove,
    movedArtifacts: [],
    updatedRelations: [],
    removedRelationIds: []
  }

  if (!keep || !remove) {
    plan.reasons.push('请选择同一探方内要保留与要并入的两个地层单位')
    return plan
  }
  if (keep.id === remove.id) {
    plan.reasons.push(`「${keep.code}」不能与自身合并，请指定两个不同的单位`)
    return plan
  }
  if (keep.trenchId !== remove.trenchId) {
    plan.reasons.push(`「${keep.code}」与「${remove.code}」不属于同一探方，跨探方单位不能合并`)
    return plan
  }

  const byId = new Map(strata.map((item) => [item.id, item]))

  // 迁移后的关系全集：把并入单位 id 改写为保留单位 id
  const movedRelations: Relation[] = relations.map((relation) => ({
    ...relation,
    unitAId: relation.unitAId === remove.id ? keep.id : relation.unitAId,
    unitBId: relation.unitBId === remove.id ? keep.id : relation.unitBId
  }))

  // 校验一：迁移后关系两端变成同一单位（保留与并入单位之间原本存在直接关系）
  relations.forEach((relation) => {
    const touchesBoth =
      (relation.unitAId === remove.id && relation.unitBId === keep.id) ||
      (relation.unitBId === remove.id && relation.unitAId === keep.id)
    if (touchesBoth) {
      plan.reasons.push(
        `已记录「${keep.code} ${relation.type} ${remove.code}」，合并后关系两端会变成同一单位「${keep.code}」，请先在层位关系视图删除该关系`
      )
    }
  })

  // 校验二：跨探方引用（并入单位的关系牵涉其他探方单位）
  relations.forEach((relation) => {
    if (relation.unitAId !== remove.id && relation.unitBId !== remove.id) return
    const otherId = relation.unitAId === remove.id ? relation.unitBId : relation.unitAId
    if (otherId === keep.id) return
    const other = byId.get(otherId)
    if (other && other.trenchId !== keep.trenchId) {
      plan.reasons.push(
        `「${remove.code}」存在指向其他探方单位「${other.code}」的${relation.type}关系，合并后「${keep.code}」会形成跨探方引用，请先核对`
      )
    }
  })

  // 校验三：深度矛盾
  // 3a. 迁移后涉及保留单位的叠压/打破关系与深度记录矛盾（叠压/打破方上界不应深于被作用方）
  movedRelations.forEach((relation) => {
    if (relation.type === '共存') return
    if (relation.unitAId !== keep.id && relation.unitBId !== keep.id) return
    if (relation.unitAId === relation.unitBId) return
    const a = byId.get(relation.unitAId)
    const b = byId.get(relation.unitBId)
    if (!a || !b) return
    if (a.topDepth > b.topDepth) {
      plan.reasons.push(
        `合并后「${a.code} ${relation.type} ${b.code}」与深度矛盾：${a.code} 上界 ${a.topDepth} m 深于 ${b.code} 上界 ${b.topDepth} m，请先修正深度或关系`
      )
    }
  })
  // 3b. 并入单位出土物的深度应落在保留单位深度区间内
  const [top, bottom] = depthRange(keep)
  artifacts.forEach((item) => {
    if (item.stratumId !== remove.id) return
    if (item.z < top || item.z > bottom) {
      plan.reasons.push(
        `出土物「${item.code}」深度 ${item.z} m 不在保留单位「${keep.code}」的深度区间（${top}–${bottom} m）内，合并后会出现深度矛盾，请先调整出土深度或单位深度`
      )
    }
  })

  if (plan.reasons.length > 0) return plan

  // 出土物改属保留单位
  plan.movedArtifacts = artifacts
    .filter((item) => item.stratumId === remove.id)
    .map((item) => ({ ...item, stratumId: keep.id }))

  // 关系迁移与归并：同一（单位 A、类型、单位 B）只保留先出现的一条
  const seen = new Set<string>()
  relations.forEach((origin, index) => {
    const moved = movedRelations[index]
    const key = relationKey(moved)
    if (seen.has(key)) {
      plan.removedRelationIds.push(origin.id)
      return
    }
    seen.add(key)
    if (moved.unitAId !== origin.unitAId || moved.unitBId !== origin.unitBId) {
      plan.updatedRelations.push(moved)
    }
  })

  plan.ok = true
  return plan
}
