<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Artifact, Stratum } from '@/types'
import { stratumThickness } from '@/types'
import StratumDepthBar from '@/components/common/StratumDepthBar.vue'
import { useStore } from '@/hooks/usePersistentStore'
import { stratumStore } from '@/stores/stratumStore'
import { trenchStore } from '@/stores/trenchStore'
import { artifactStore } from '@/stores/artifactStore'

const WALLS = ['北壁', '东壁', '南壁', '西壁'] as const

const stratumState = useStore(stratumStore)
const trenchState = useStore(trenchStore)
const artifactState = useStore(artifactStore)

const selectedTrenchId = ref('')
const wall = ref<(typeof WALLS)[number]>('北壁')
const showArtifacts = ref(true)

const CANVAS_W = 760
const CANVAS_H = 460
const SCALE_H = CANVAS_H - 70

watch(
  () => [trenchState.trenches.length, selectedTrenchId.value] as const,
  () => {
    if (!selectedTrenchId.value && trenchState.trenches.length > 0) {
      selectedTrenchId.value = trenchState.trenches[0].id
    }
  },
  { immediate: true }
)

const trench = computed(() => trenchState.trenches.find((item) => item.id === selectedTrenchId.value) ?? null)

const strata = computed(() =>
  stratumState.strata
    .filter((item) => item.trenchId === selectedTrenchId.value)
    .sort((a, b) => a.topDepth - b.topDepth)
)

const maxDepth = computed(() => {
  const deepest = strata.value.reduce((max, item) => Math.max(max, item.bottomDepth, item.topDepth), 0)
  return Math.max(0.5, Math.ceil((deepest + 0.2) * 10) / 10)
})

const depthToY = (depth: number): number => 40 + (depth / maxDepth.value) * SCALE_H

const ticks = computed(() => {
  const step = maxDepth.value <= 1 ? 0.2 : maxDepth.value <= 2 ? 0.5 : 1
  const list: number[] = []
  for (let value = 0; value <= maxDepth.value + 1e-6; value += step) {
    list.push(Math.round(value * 100) / 100)
  }
  return list
})

const artifactsOfTrench = computed<Artifact[]>(() => {
  const unitIds = strata.value.map((item) => item.id)
  return artifactState.artifacts.filter((item) => unitIds.includes(item.stratumId))
})

/** 出土物在剖面上的投影位置：X 轴按探方内 X 坐标，Y 轴按出土深度 */
function artifactPos(artifact: Artifact): { x: number; y: number } {
  const x = 90 + (Math.min(5, Math.max(0, artifact.x)) / 5) * (CANVAS_W - 150)
  return { x, y: depthToY(artifact.z) }
}

function stratumLabel(stratum: Stratum): string {
  return `${stratum.code} · ${stratum.type} · 厚 ${stratumThickness(stratum)} m`
}

const unitColors: Record<string, string> = {
  地层: '#d8c48a',
  灰坑: '#b08a5a',
  房址: '#b9a3d0',
  沟: '#8fbfae',
  墓葬: '#d99b90'
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">探方四壁剖面示意</h2>
        <p class="page-sub">
          按深度刻度绘制地层条带，标注单位号与厚度；可叠加出土物投影点，便于核对层位与出土上下关系。当前示意壁向：{{ wall }}。
        </p>
      </div>
      <div class="head-actions">
        <el-select v-model="selectedTrenchId" placeholder="选择探方" style="width: 200px">
          <el-option v-for="item in trenchState.trenches" :key="item.id" :label="`${item.area} · ${item.code}`" :value="item.id" />
        </el-select>
        <el-select v-model="wall" style="width: 120px">
          <el-option v-for="item in WALLS" :key="item" :label="item" :value="item" />
        </el-select>
        <el-switch v-model="showArtifacts" active-text="显示出土物" />
      </div>
    </div>

    <el-alert
      v-if="strata.length === 0"
      class="alert"
      type="warning"
      :closable="false"
      show-icon
      title="该探方暂无地层单位，请先到「地层单位编目」录入"
    />
    <el-alert
      v-else
      class="alert"
      type="info"
      :closable="false"
      show-icon
      :title="`${trench?.area} · ${trench?.code}（${trench?.size}）共 ${strata.length} 个地层单位、${artifactsOfTrench.length} 件出土物；最深 ${maxDepth} m`"
    >
      <template #default>
        <p v-if="trench?.wallNote">四壁方向备注：{{ trench.wallNote }}</p>
      </template>
    </el-alert>

    <div class="layout">
      <el-card shadow="never" class="section-card">
        <template #header>{{ wall }}剖面示意（深度刻度 0 – {{ maxDepth }} m）</template>
        <svg :width="CANVAS_W" :height="CANVAS_H" role="img" :aria-label="`${wall}剖面示意`">
          <rect :width="CANVAS_W" :height="CANVAS_H" rx="10" fill="#fbfaf6" stroke="#e6ded0" />
          <!-- 地层条带 -->
          <g v-for="stratum in strata" :key="stratum.id">
            <rect
              x="90"
              :y="depthToY(Math.min(stratum.topDepth, stratum.bottomDepth))"
              :width="CANVAS_W - 150"
              :height="Math.max(6, depthToY(Math.max(stratum.topDepth, stratum.bottomDepth)) - depthToY(Math.min(stratum.topDepth, stratum.bottomDepth)))"
              :fill="unitColors[stratum.type] ?? '#d8c48a'"
              :stroke="stratum.topDepth > stratum.bottomDepth ? '#c0392b' : '#b9a77f'"
              :stroke-width="stratum.topDepth > stratum.bottomDepth ? 2 : 1"
              opacity="0.92"
            />
            <text
              :x="97"
              :y="depthToY(Math.min(stratum.topDepth, stratum.bottomDepth)) + 14"
              font-size="11"
              fill="#4a3722"
            >
              {{ stratumLabel(stratum) }}
            </text>
            <text
              :x="CANVAS_W - 52"
              :y="depthToY(Math.min(stratum.topDepth, stratum.bottomDepth)) + 14"
              font-size="10"
              fill="#6b5b45"
            >
              {{ stratum.soil.slice(0, 8) }}
            </text>
          </g>

          <!-- 深度刻度 -->
          <g stroke="#c9bfae" stroke-width="1">
            <line v-for="tick in ticks" :key="`t${tick}`" x1="70" :y1="depthToY(tick)" x2="90" :y2="depthToY(tick)" />
          </g>
          <g font-size="10" fill="#7d7264">
            <text v-for="tick in ticks" :key="`tt${tick}`" x="14" :y="depthToY(tick) + 3">
              {{ tick.toFixed(1) }} m
            </text>
          </g>

          <!-- 出土物投影 -->
          <g v-if="showArtifacts">
            <g v-for="artifact in artifactsOfTrench" :key="artifact.id">
              <circle :cx="artifactPos(artifact).x" :cy="artifactPos(artifact).y" r="5" fill="#c0392b" stroke="#fff" stroke-width="1.4" />
              <text :x="artifactPos(artifact).x + 8" :y="artifactPos(artifact).y + 4" font-size="10" fill="#8a3a2c">
                {{ artifact.code }}
              </text>
            </g>
          </g>

          <text :x="CANVAS_W / 2 - 40" y="24" font-size="12" fill="#4a3722">
            {{ wall }}（地表 0 m）
          </text>
          <text v-if="strata.length === 0" :x="CANVAS_W / 2 - 60" :y="CANVAS_H / 2" font-size="13" fill="#8a97a3">
            暂无可绘制的层位数据
          </text>
        </svg>
        <div class="legend">
          <span v-for="(color, type) in unitColors" :key="type"><i :style="{ background: color }" />{{ type }}</span>
          <span><i class="artifact" />出土物投影点</span>
        </div>
      </el-card>

      <el-card shadow="never" class="list-card">
        <template #header>地层条带（深度刻度条）</template>
        <div class="bars">
          <div v-for="stratum in strata" :key="stratum.id" class="bar-row">
            <div class="bar-head">
              <span class="mono">{{ stratum.code }}</span>
              <el-tag size="small" effect="plain">{{ stratum.type }}</el-tag>
              <span class="muted">{{ stratum.openLayer }}</span>
            </div>
            <StratumDepthBar :stratum="stratum" :length="250" :max-depth="maxDepth" />
            <p class="soil">{{ stratum.soil || '未记录土质土色' }} · 包含物 {{ stratum.inclusions.join('、') || '无' }}</p>
          </div>
          <p v-if="strata.length === 0" class="muted">暂无地层单位</p>
        </div>

        <template v-if="artifactsOfTrench.length > 0">
          <h4 class="sub-title">出土物上下关系（按深度）</h4>
          <ul class="artifact-list">
            <li v-for="artifact in [...artifactsOfTrench].sort((a, b) => a.z - b.z)" :key="artifact.id">
              <span class="mono">{{ artifact.code }}</span>
              <span>{{ artifact.category }} × {{ artifact.count }}（{{ artifact.completeness }}）</span>
              <span class="muted">Z = {{ artifact.z }} m · {{ strata.find((item) => item.id === artifact.stratumId)?.code ?? '未知单位' }}</span>
            </li>
          </ul>
        </template>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.alert {
  margin-bottom: 14px;
}
.head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.layout {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
}
.section-card {
  flex: 1 1 620px;
  border-radius: 12px;
}
.list-card {
  flex: 1 1 320px;
  border-radius: 12px;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 6px;
  font-size: 12px;
  color: #6b5b45;
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.legend i {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  display: inline-block;
}
.legend i.artifact {
  background: #c0392b;
  border-radius: 50%;
}
.bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bar-row {
  padding-bottom: 8px;
  border-bottom: 1px dotted #e6ded0;
}
.bar-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 13px;
}
.soil {
  margin: 4px 0 0;
  font-size: 11px;
  color: #8a8073;
}
.sub-title {
  margin: 16px 0 6px;
  font-size: 13px;
}
.artifact-list {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  line-height: 1.8;
}
</style>
