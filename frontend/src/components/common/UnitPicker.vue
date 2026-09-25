<script setup lang="ts">
import { computed } from 'vue'
import type { Stratum, Trench, UnitType } from '@/types'
import { UNIT_TYPES } from '@/types'

const props = withDefaults(
  defineProps<{
    trenches: Trench[]
    strata: Stratum[]
    /** 当前选中的探方（v-model:trench-id） */
    trenchId: string
    /** 当前选中的单位（v-model） */
    modelValue: string
    typeFilter?: UnitType | ''
    disabled?: boolean
    showDepthRange?: boolean
  }>(),
  { typeFilter: '', disabled: false, showDepthRange: true }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'update:trenchId', value: string): void
}>()

const units = computed(() =>
  props.strata.filter((item) => {
    if (props.trenchId && item.trenchId !== props.trenchId) return false
    if (props.typeFilter && item.type !== props.typeFilter) return false
    return true
  })
)

const selected = computed(() => props.strata.find((item) => item.id === props.modelValue) ?? null)

function trenchLabel(id: string): string {
  const trench = props.trenches.find((item) => item.id === id)
  return trench ? `${trench.area} · ${trench.code}` : '未知探方'
}
</script>

<template>
  <div class="unit-picker" data-testid="unit-picker">
    <div class="row">
      <span class="lab">探方</span>
      <el-select
        :model-value="trenchId"
        :disabled="disabled"
        placeholder="全部探方"
        clearable
        style="width: 190px"
        @update:model-value="(value: string) => emit('update:trenchId', value ?? '')"
      >
        <el-option v-for="trench in trenches" :key="trench.id" :label="`${trench.area} · ${trench.code}`" :value="trench.id" />
      </el-select>
      <span class="lab">地层单位</span>
      <el-select
        :model-value="modelValue"
        :disabled="disabled"
        placeholder="选择地层单位"
        filterable
        style="width: 100%"
        @update:model-value="(value: string) => emit('update:modelValue', value)"
      >
        <el-option
          v-for="unit in units"
          :key="unit.id"
          :label="`${unit.code}（${unit.type} · ${unit.topDepth}–${unit.bottomDepth} m）`"
          :value="unit.id"
        />
      </el-select>
    </div>
    <p v-if="showDepthRange" class="hint">
      <template v-if="selected">
        已锁定：{{ trenchLabel(selected.trenchId) }} · {{ selected.code }}（{{ selected.type }}）· 深度
        {{ selected.topDepth }}–{{ selected.bottomDepth }} m · 包含物 {{ selected.inclusions.join('、') || '无' }}
      </template>
      <template v-else>尚未选择地层单位（共 {{ units.length }} 个候选）</template>
    </p>
    <div v-if="!typeFilter" class="types">
      <el-tag v-for="type in UNIT_TYPES" :key="type" size="small" effect="plain">
        {{ type }} {{ units.filter((item) => item.type === type).length }}
      </el-tag>
    </div>
  </div>
</template>

<style scoped>
.unit-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.lab {
  font-size: 12px;
  color: #6b7b8c;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: #8a5a2b;
}
.types {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
