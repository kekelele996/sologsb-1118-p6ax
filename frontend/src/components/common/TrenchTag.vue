<script setup lang="ts">
import { computed } from 'vue'
import type { Trench, UnitType } from '@/types'

const props = withDefaults(
  defineProps<{
    /** 探方对象或直接传编号 */
    trench?: Trench | null
    /** 单位类型：传了则渲染类型标签 */
    unitType?: UnitType | null
    size?: 'small' | 'default'
  }>(),
  { trench: null, unitType: null, size: 'default' }
)

const UNIT_COLORS: Record<UnitType, string> = {
  地层: '#2f6f8f',
  灰坑: '#8a5a2b',
  房址: '#8e6bbf',
  沟: '#1f8a70',
  墓葬: '#c0392b'
}

const isUnit = computed(() => Boolean(props.unitType))
const color = computed(() =>
  props.unitType ? UNIT_COLORS[props.unitType] : props.trench?.backfilled ? '#6b7b8c' : '#c9a227'
)
const label = computed(() => {
  if (props.unitType) return props.unitType as string
  if (!props.trench) return '未知探方'
  return `${props.trench.area} · ${props.trench.code}`
})
</script>

<template>
  <span class="trench-tag" :class="[`is-${size}`, { unit: isUnit }]" :style="{ '--tag-color': color }">
    <i class="dot" />
    {{ label }}
    <em v-if="!isUnit && trench">{{ trench.size }}<template v-if="trench.backfilled"> · 已回填</template></em>
  </span>
</template>

<style scoped>
.trench-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 20px;
  color: var(--tag-color);
  background: color-mix(in srgb, var(--tag-color) 13%, transparent);
  border: 1px solid color-mix(in srgb, var(--tag-color) 40%, transparent);
  white-space: nowrap;
}
.trench-tag.is-small {
  font-size: 11px;
  padding: 0 8px;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--tag-color);
}
em {
  font-style: normal;
  font-size: 11px;
  color: #7a8896;
}
</style>
