<script setup lang="ts">
import { computed } from 'vue'
import type { Stratum } from '@/types'
import { stratumThickness } from '@/types'

const props = withDefaults(
  defineProps<{
    stratum: Pick<Stratum, 'code' | 'topDepth' | 'bottomDepth' | 'type'>
    /** 深度刻度上限（米），默认按地层下界自动扩展 */
    maxDepth?: number
    /** 朝向：horizontal 用于表格内，vertical 用于剖面示意 */
    orientation?: 'horizontal' | 'vertical'
    /** 刻度条长度（像素） */
    length?: number
    showThickness?: boolean
  }>(),
  { maxDepth: 0, orientation: 'horizontal', length: 200, showThickness: true }
)

const inverted = computed(() => props.stratum.topDepth > props.stratum.bottomDepth)
const upper = computed(() => Math.min(props.stratum.topDepth, props.stratum.bottomDepth))
const lower = computed(() => Math.max(props.stratum.topDepth, props.stratum.bottomDepth))
const maxDepth = computed(() => {
  if (props.maxDepth && props.maxDepth > 0) return props.maxDepth
  return Math.max(0.5, Math.ceil((lower.value + 0.2) * 10) / 10)
})
const thickness = computed(() => stratumThickness(props.stratum))

const bandStart = computed(() => (upper.value / maxDepth.value) * props.length)
const bandSize = computed(() => Math.max(4, ((lower.value - upper.value) / maxDepth.value) * props.length))

const ticks = computed(() => {
  const step = maxDepth.value <= 1 ? 0.2 : maxDepth.value <= 2 ? 0.5 : 1
  const list: number[] = []
  for (let value = 0; value <= maxDepth.value + 1e-6; value += step) {
    list.push(Math.round(value * 100) / 100)
  }
  return list
})

const tickPos = (value: number): number => (value / maxDepth.value) * props.length
</script>

<template>
  <div class="depth-bar" :class="[orientation, { inverted }]" data-testid="stratum-depth-bar">
    <template v-if="orientation === 'horizontal'">
      <div class="bar-wrap" :style="{ width: `${length}px` }">
        <div class="track" :style="{ width: `${length}px` }" />
        <div class="band" :style="{ left: `${bandStart}px`, width: `${bandSize}px` }" />
        <div v-for="tick in ticks" :key="tick" class="tick" :style="{ left: `${tickPos(tick)}px` }" />
      </div>
      <div class="labels">
        <span class="range">{{ upper.toFixed(2) }} – {{ lower.toFixed(2) }} m</span>
        <span v-if="showThickness" class="thickness">厚 {{ thickness }} m</span>
        <el-tag v-if="inverted" type="danger" size="small" effect="dark">层序倒置</el-tag>
      </div>
    </template>
    <template v-else>
      <div class="v-labels">
        <span v-for="tick in ticks" :key="`v${tick}`">{{ tick.toFixed(1) }} m</span>
      </div>
      <div class="v-wrap" :style="{ height: `${length}px` }">
        <svg :width="34" :height="length" role="img" :aria-label="`${stratum.code} 深度刻度`">
          <rect x="0" y="0" width="34" height="length" fill="#f7f4ee" stroke="#dcd3c4" />
          <rect x="4" :y="bandStart" width="26" :height="bandSize" rx="3" :fill="inverted ? '#c0392b' : '#a9762f'" opacity="0.85" />
          <g stroke="#c9bfae" stroke-width="1">
            <line v-for="tick in ticks" :key="`t${tick}`" x1="0" :y1="tickPos(tick)" x2="8" :y2="tickPos(tick)" />
          </g>
        </svg>
      </div>
    </template>
  </div>
</template>

<style scoped>
.depth-bar {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.depth-bar.vertical {
  flex-direction: row;
  align-items: flex-start;
  gap: 6px;
}
.bar-wrap {
  position: relative;
  height: 16px;
}
.track {
  position: absolute;
  top: 6px;
  height: 5px;
  border-radius: 3px;
  background: #edf1f5;
}
.band {
  position: absolute;
  top: 2px;
  height: 13px;
  border-radius: 3px;
  background: linear-gradient(180deg, #c9a227, #a9762f);
}
.inverted .band {
  background: linear-gradient(180deg, #e07a6a, #c0392b);
}
.tick {
  position: absolute;
  top: 12px;
  width: 1px;
  height: 5px;
  background: #cfd9e2;
}
.labels {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #6b7b8c;
  white-space: nowrap;
}
.thickness {
  color: #8a5a2b;
}
.v-labels {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  font-size: 10px;
  color: #7a8896;
}
.v-wrap {
  position: relative;
}
</style>
