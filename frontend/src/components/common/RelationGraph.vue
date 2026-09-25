<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { GraphEdge, GraphNode } from '@/utils/graph'

const props = withDefaults(
  defineProps<{
    nodes: GraphNode[]
    edges: GraphEdge[]
    /** 当前高亮的节点集合 */
    highlighted?: Set<string>
    /** 选中的节点 id */
    activeId?: string | null
    width?: number
    height?: number
  }>(),
  { highlighted: () => new Set<string>(), activeId: null, width: 760, height: 420 }
)

const emit = defineEmits<{
  (event: 'select', nodeId: string): void
}>()

const EDGE_COLORS: Record<string, string> = {
  叠压: '#2f6f8f',
  打破: '#c0392b',
  共存: '#1f8a70'
}

const TYPE_FILLS: Record<string, string> = {
  地层: '#2f6f8f',
  灰坑: '#8a5a2b',
  房址: '#8e6bbf',
  沟: '#1f8a70',
  墓葬: '#c0392b'
}

const positions = reactive<Record<string, { x: number; y: number }>>({})
const dragging = ref<string | null>(null)
const dragOffset = reactive({ x: 0, y: 0 })

/** 初始布局：按拓扑层次分列，同层按顺序纵向排布 */
function layout(): void {
  const byLayer = new Map<number, GraphNode[]>()
  props.nodes.forEach((node) => {
    const list = byLayer.get(node.layer) ?? []
    list.push(node)
    byLayer.set(node.layer, list)
  })
  const layers = Array.from(byLayer.keys()).sort((a, b) => a - b)
  layers.forEach((layer, layerIndex) => {
    const column = byLayer.get(layer) ?? []
    column.forEach((node, index) => {
      positions[node.id] = {
        x: 90 + layerIndex * Math.min(170, (props.width - 160) / Math.max(1, layers.length)),
        y: 70 + index * 78
      }
    })
  })
}

watch(
  () => props.nodes.map((node) => node.id).join('|'),
  () => layout(),
  { immediate: true }
)

function onMouseDown(nodeId: string, event: MouseEvent): void {
  const position = positions[nodeId]
  if (!position) return
  dragging.value = nodeId
  const svg = (event.currentTarget as SVGElement).ownerSVGElement
  const rect = svg?.getBoundingClientRect()
  dragOffset.x = event.clientX - (rect?.left ?? 0) - position.x
  dragOffset.y = event.clientY - (rect?.top ?? 0) - position.y
}

function onMouseMove(event: MouseEvent): void {
  if (!dragging.value) return
  const svg = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
  const x = event.clientX - svg.left - dragOffset.x
  const y = event.clientY - svg.top - dragOffset.y
  positions[dragging.value] = {
    x: Math.max(30, Math.min(props.width - 60, x)),
    y: Math.max(26, Math.min(props.height - 30, y))
  }
}

function onMouseUp(): void {
  dragging.value = null
}

const edgeGeometry = computed(() =>
  props.edges
    .map((edge) => {
      const from = positions[edge.from]
      const to = positions[edge.to]
      if (!from || !to) return null
      const dx = to.x - from.x
      const dy = to.y - from.y
      const length = Math.hypot(dx, dy) || 1
      const shrink = 22
      return {
        edge,
        x1: from.x + (dx / length) * shrink,
        y1: from.y + (dy / length) * shrink,
        x2: to.x - (dx / length) * shrink,
        y2: to.y - (dy / length) * shrink,
        labelX: (from.x + to.x) / 2,
        labelY: (from.y + to.y) / 2 - 5
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
)

function nodeOpacity(node: GraphNode): number {
  if (props.highlighted.size === 0) return 1
  return props.highlighted.has(node.id) ? 1 : 0.28
}

function edgeOpacity(edge: GraphEdge): number {
  if (props.highlighted.size === 0) return 1
  const active = props.activeId
  if (!active) return 1
  return edge.from === active || edge.to === active ? 1 : 0.2
}
</script>

<template>
  <div class="relation-graph" data-testid="relation-graph">
    <svg
      :width="width"
      :height="height"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      role="img"
      aria-label="层位关系有向图"
    >
      <defs>
        <marker id="rg-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
          <path d="M0,0 L7,3 L0,6 z" fill="#8a97a3" />
        </marker>
        <marker id="rg-arrow-cycle" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
          <path d="M0,0 L7,3 L0,6 z" fill="#c0392b" />
        </marker>
      </defs>
      <rect :width="width" :height="height" rx="10" fill="#fbfaf6" stroke="#e6ded0" />

      <g v-for="item in edgeGeometry" :key="item.edge.id" :opacity="edgeOpacity(item.edge)">
        <line
          :x1="item.x1"
          :y1="item.y1"
          :x2="item.x2"
          :y2="item.y2"
          :stroke="item.edge.inCycle ? '#c0392b' : EDGE_COLORS[item.edge.type] ?? '#8a97a3'"
          :stroke-width="item.edge.inCycle ? 2.6 : 1.8"
          :stroke-dasharray="item.edge.inCycle ? '7 4' : '0'"
          :marker-end="item.edge.inCycle ? 'url(#rg-arrow-cycle)' : 'url(#rg-arrow)'"
        />
        <text :x="item.labelX" :y="item.labelY" font-size="10" text-anchor="middle" fill="#6b7b8c">
          {{ item.edge.type }}
        </text>
      </g>

      <g
        v-for="node in nodes"
        :key="node.id"
        :opacity="nodeOpacity(node)"
        class="node"
        @mousedown.prevent="onMouseDown(node.id, $event)"
        @click="emit('select', node.id)"
      >
        <circle
          :cx="positions[node.id]?.x ?? 0"
          :cy="positions[node.id]?.y ?? 0"
          r="20"
          :fill="activeId === node.id ? '#c9a227' : TYPE_FILLS[node.type] ?? '#2f6f8f'"
          :stroke="highlighted.has(node.id) ? '#a9762f' : '#ffffff'"
          :stroke-width="highlighted.has(node.id) ? 3 : 1.6"
        />
        <text
          :x="positions[node.id]?.x ?? 0"
          :y="(positions[node.id]?.y ?? 0) + 4"
          font-size="11"
          text-anchor="middle"
          fill="#fff"
        >
          {{ node.label }}
        </text>
        <text
          :x="(positions[node.id]?.x ?? 0) + 26"
          :y="(positions[node.id]?.y ?? 0) + 4"
          font-size="11"
          fill="#3c4b57"
        >
          {{ node.sublabel }}
        </text>
      </g>

      <text v-if="nodes.length === 0" :x="width / 2 - 70" :y="height / 2" font-size="13" fill="#8a97a3">
        暂无地层单位，无法绘制关系图
      </text>
    </svg>
    <div class="legend">
      <span v-for="(color, type) in EDGE_COLORS" :key="type">
        <i :style="{ background: color }" />{{ type }}
      </span>
      <span><i class="cycle" />环路冲突</span>
      <span class="muted">拖动节点可调整布局，点击节点高亮直接关系</span>
    </div>
  </div>
</template>

<style scoped>
.relation-graph {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
svg {
  border-radius: 10px;
  cursor: default;
}
.node {
  cursor: grab;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: #5c6b7a;
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.legend i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.legend i.cycle {
  background: repeating-linear-gradient(90deg, #c0392b 0 4px, transparent 4px 7px);
  border-radius: 2px;
}
.muted {
  color: #8a97a3;
}
</style>
