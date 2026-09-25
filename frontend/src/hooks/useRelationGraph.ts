import { computed, type Ref } from 'vue'
import type { Relation, Stratum } from '@/types'
import { buildGraph, highlightSubgraph, wouldCreateCycle, type DirectedGraph } from '@/utils/graph'

export interface RelationGraphResult {
  graph: Ref<DirectedGraph>
  /** 当前高亮的节点集合（含直接关联节点） */
  highlighted: Ref<Set<string>>
  /** 某节点直接关联的节点数 */
  degreeOf: (nodeId: string) => number
}

/**
 * 构建关系邻接表、检测环路并返回高亮子图。
 * @param strata 地层单位
 * @param relations 层位关系
 * @param activeId 当前选中的节点（点击节点后高亮其直接关系）
 */
export function useRelationGraph(
  strata: Ref<Stratum[]>,
  relations: Ref<Relation[]>,
  activeId: Ref<string | null>
): RelationGraphResult {
  const graph = computed<DirectedGraph>(() => buildGraph(strata.value, relations.value))
  const highlighted = computed<Set<string>>(() => highlightSubgraph(graph.value, activeId.value))
  const degreeOf = (nodeId: string): number => {
    const outgoing = graph.value.adjacency.get(nodeId)?.length ?? 0
    const incoming = graph.value.reverse.get(nodeId)?.length ?? 0
    return outgoing + incoming
  }
  return { graph, highlighted, degreeOf }
}

/** 校验一条待保存关系是否会造成环路矛盾 */
export function checkRelationCycle(relations: Relation[], candidate: Pick<Relation, 'unitAId' | 'unitBId' | 'type'>): boolean {
  return wouldCreateCycle(relations, candidate)
}
