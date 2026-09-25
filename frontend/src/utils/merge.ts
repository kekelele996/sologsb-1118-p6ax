import type { Artifact, Relation, Stratum } from '@/types'

/** 合并计划：迁移出土物、改写并归并层位关系、删除并入单位 */
export interface MergePlan {
  /** 保留单位（编号与编目信息保持不变） */
  keep: Stratum
  /** 并入单位（合并后删除） */
  drop: Stratum
  /** 迁入保留单位的出土物（stratumId 已改写） */
  movedArtifacts: Artifact[]
  /** 端点改写后需要写回的层位关系 */
  updatedRelations: Relation[]
  /** 归并掉的重复关系 id */
  removedRelationIds: string[]
  stats: {
    /** 迁移出土物数量 */
    artifacts: number
    /** 迁移层位关系数量 */
    relations: number
    /** 归并重复关系数量 */
    mergedRelations: number
  }
}

export type MergeOutcome = { ok: true; plan: MergePlan } | { ok: false; blockers: string[] }

/** 关系归并键：叠压/打破区分方向，共存不区分方向 */
function relationKey(relation: Relation): string {
  if (relation.type === '共存') {
    const pair = [relation.unitAId, relation.unitBId].sort()
    return `${relation.type}:${pair[0]}:${pair[1]}`
  }
  return `${relation.type}:${relation.unitAId}:${relation.unitBId}`
}

/** 与编目表一致的「层位关系与深度矛盾」判定：A 叠压/打破 B，但 A 上界更深 */
function depthConflictOf(relation: Relation, byId: Map<string, Stratum>): string | null {
  if (relation.type === '共存') return null
  const a = byId.get(relation.unitAId)
  const b = byId.get(relation.unitBId)
  if (!a || !b) return null
  if (a.topDepth > b.topDepth) {
    return `${a.code} ${relation.type} ${b.code}，但 ${a.code} 上界深度（${a.topDepth} m）大于 ${b.code}（${b.topDepth} m）`
  }
  return null
}

/** 构建邻接表（共存按双向处理） */
function buildAdjacency(relations: Relation[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>()
  const push = (from: string, to: string): void => {
    const list = adjacency.get(from) ?? []
    list.push(to)
    adjacency.set(from, list)
  }
  relations.forEach((relation) => {
    push(relation.unitAId, relation.unitBId)
    if (relation.type === '共存') push(relation.unitBId, relation.unitAId)
  })
  return adjacency
}

/** 从 start 出发沿关系能否回到 start（即 start 是否处于环路中） */
function reachesSelf(adjacency: Map<string, string[]>, start: string): boolean {
  const visited = new Set<string>()
  const stack = [...(adjacency.get(start) ?? [])]
  while (stack.length > 0) {
    const node = stack.pop() as string
    if (node === start) return true
    if (visited.has(node)) continue
    visited.add(node)
    stack.push(...(adjacency.get(node) ?? []))
  }
  return false
}

/**
 * 制定地层单位合并计划（纯函数，不落库）：
 * - 把并入单位的出土物与层位关系迁移到保留单位，重复关系归并；
 * - 若合并后会出现深度矛盾、关系两端变成同一单位或跨探方引用，则返回原因，调用方保持两个单位原样。
 */
export function planStratumMerge(
  strata: Stratum[],
  artifacts: Artifact[],
  relations: Relation[],
  keepId: string,
  dropId: string
): MergeOutcome {
  const keep = strata.find((item) => item.id === keepId)
  const drop = strata.find((item) => item.id === dropId)
  if (!keep || !drop) return { ok: false, blockers: ['请选择要合并的两个地层单位'] }
  if (keep.id === drop.id) return { ok: false, blockers: [`「${keep.code}」不能与自身合并，请选择另一个单位`] }
  if (keep.trenchId !== drop.trenchId) {
    return { ok: false, blockers: [`「${keep.code}」与「${drop.code}」不属于同一探方，不能合并`] }
  }

  const byId = new Map(strata.map((item) => [item.id, item]))
  const repoint = (id: string): string => (id === drop.id ? keep.id : id)

  // 出土物：所属单位改写为保留单位
  const movedArtifacts = artifacts
    .filter((item) => item.stratumId === drop.id)
    .map((item) => ({ ...item, stratumId: keep.id }))

  // 层位关系：涉及并入单位的端点改写为保留单位
  const migratedIds = new Set(
    relations.filter((item) => item.unitAId === drop.id || item.unitBId === drop.id).map((item) => item.id)
  )
  const repointed = relations.map((relation) =>
    migratedIds.has(relation.id)
      ? { ...relation, unitAId: repoint(relation.unitAId), unitBId: repoint(relation.unitBId) }
      : relation
  )

  const blockers: string[] = []

  // 校验一：关系两端变成同一单位（并入单位与保留单位之间本就有关系）
  repointed.forEach((relation) => {
    if (relation.unitAId === relation.unitBId) {
      blockers.push(
        `「${drop.code}」与「${keep.code}」之间已存在${relation.type}关系，合并后关系两端都是「${keep.code}」，无法成立`
      )
    }
  })

  // 校验二：跨探方引用（并入单位与其他探方的单位存在关系）
  repointed.forEach((relation) => {
    if (!migratedIds.has(relation.id) || relation.unitAId === relation.unitBId) return
    const otherId = relation.unitAId === keep.id ? relation.unitBId : relation.unitAId
    const other = byId.get(otherId)
    if (other && other.trenchId !== keep.trenchId) {
      blockers.push(
        `「${drop.code}」与「${other.code}」（其他探方）存在${relation.type}关系，合并后将形成跨探方引用`
      )
    }
  })

  // 校验三：深度矛盾（迁移过来的关系与保留单位的深度相冲突）
  repointed.forEach((relation) => {
    if (!migratedIds.has(relation.id) || relation.unitAId === relation.unitBId) return
    const conflict = depthConflictOf(relation, byId)
    if (conflict) blockers.push(`合并后将出现深度矛盾：${conflict}`)
  })

  // 重复关系归并：保留单位原有关系优先，迁入的重复关系归并删除
  const seen = new Set<string>()
  const removedRelationIds: string[] = []
  const finalRelations: Relation[] = []
  const ordered = [...repointed].sort((a, b) => Number(migratedIds.has(a.id)) - Number(migratedIds.has(b.id)))
  ordered.forEach((relation) => {
    const key = relationKey(relation)
    if (seen.has(key)) {
      removedRelationIds.push(relation.id)
      return
    }
    seen.add(key)
    finalRelations.push(relation)
  })

  // 校验四：环路矛盾（仅当合并新引入经过保留单位的环路时阻止）
  const cycleBefore = reachesSelf(buildAdjacency(relations), keep.id)
  const cycleAfter = reachesSelf(buildAdjacency(finalRelations), keep.id)
  if (cycleAfter && !cycleBefore) {
    blockers.push(`合并后将形成环路矛盾：层位关系经由「${keep.code}」自相闭合`)
  }

  if (blockers.length > 0) return { ok: false, blockers }

  const updatedRelations = finalRelations.filter((relation) => migratedIds.has(relation.id))
  return {
    ok: true,
    plan: {
      keep,
      drop,
      movedArtifacts,
      updatedRelations,
      removedRelationIds,
      stats: {
        artifacts: movedArtifacts.length,
        relations: updatedRelations.length,
        mergedRelations: removedRelationIds.length
      }
    }
  }
}
