<script setup lang="ts">
import { computed, h, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Inclusion, Stratum, UnitType } from '@/types'
import { INCLUSIONS, UNIT_TYPES, isCodeDuplicated, isDepthInverted, stratumThickness } from '@/types'
import StratumDepthBar from '@/components/common/StratumDepthBar.vue'
import TrenchTag from '@/components/common/TrenchTag.vue'
import { useStore } from '@/hooks/usePersistentStore'
import { useStratumOrder } from '@/hooks/useStratumOrder'
import { stratumStore } from '@/stores/stratumStore'
import { trenchStore } from '@/stores/trenchStore'
import { artifactStore } from '@/stores/artifactStore'
import { relationStore } from '@/stores/relationStore'
import { planStratumMerge, type MergePlan } from '@/utils/merge'
import { uid } from '@/utils/id'

const trenchState = useStore(trenchStore)
const stratumState = useStore(stratumStore)
const artifactState = useStore(artifactStore)
const relationState = useStore(relationStore)

const { result: order } = useStratumOrder(
  computed(() => stratumState.strata),
  computed(() => relationState.relations)
)

const filterTrenchId = ref('')
const filterType = ref<UnitType | ''>('')
const depthFrom = ref<number | undefined>(undefined)
const depthTo = ref<number | undefined>(undefined)
const selectedIds = ref<string[]>([])
const batchType = ref<UnitType>('地层')

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)

const form = reactive({
  trenchId: '',
  code: '',
  type: '地层' as UnitType,
  openLayer: '第①层',
  topDepth: 0,
  bottomDepth: 0.3,
  soil: '',
  inclusions: [] as Inclusion[],
  formation: '',
  date: new Date().toISOString().slice(0, 10),
  drawingNo: ''
})

const visible = computed(() =>
  stratumState.strata.filter((item) => {
    if (filterTrenchId.value && item.trenchId !== filterTrenchId.value) return false
    if (filterType.value && item.type !== filterType.value) return false
    if (depthFrom.value !== undefined && item.bottomDepth < depthFrom.value) return false
    if (depthTo.value !== undefined && item.topDepth > depthTo.value) return false
    return true
  })
)

function trenchLabel(trenchId: string): string {
  const trench = trenchState.trenches.find((item) => item.id === trenchId)
  return trench ? `${trench.area} · ${trench.code}` : '未知探方'
}

function artifactsOf(stratumId: string): number {
  return artifactState.artifacts.filter((item) => item.stratumId === stratumId).reduce((sum, item) => sum + item.count, 0)
}

function invertedOf(stratum: Stratum): boolean {
  return isDepthInverted(stratum)
}

function duplicatedOf(stratum: Stratum): boolean {
  return isCodeDuplicated(stratumState.strata, stratum)
}

function rowClass(param: { row: Stratum }): string {
  if (invertedOf(param.row)) return 'inverted-row'
  if (duplicatedOf(param.row)) return 'duplicate-row'
  return ''
}

/** 与层位关系矛盾的告警（按单位过滤） */
const conflictOf = (code: string): string | null =>
  order.value.conflicts.find((item) => item.startsWith(code)) ?? null

watch(
  () => [trenchState.trenches.length, form.trenchId] as const,
  () => {
    if (!form.trenchId && trenchState.trenches.length > 0) form.trenchId = trenchState.trenches[0].id
  },
  { immediate: true }
)

function resetForm(): void {
  editingId.value = null
  form.trenchId = trenchState.trenches[0]?.id ?? ''
  form.code = ''
  form.type = '地层'
  form.openLayer = '第①层'
  form.topDepth = 0
  form.bottomDepth = 0.3
  form.soil = ''
  form.inclusions = []
  form.formation = ''
  form.date = new Date().toISOString().slice(0, 10)
  form.drawingNo = ''
}

function openCreate(): void {
  resetForm()
  dialogVisible.value = true
}

function openEdit(stratum: Stratum): void {
  editingId.value = stratum.id
  Object.assign(form, {
    trenchId: stratum.trenchId,
    code: stratum.code,
    type: stratum.type,
    openLayer: stratum.openLayer,
    topDepth: stratum.topDepth,
    bottomDepth: stratum.bottomDepth,
    soil: stratum.soil,
    inclusions: [...stratum.inclusions],
    formation: stratum.formation,
    date: stratum.date,
    drawingNo: stratum.drawingNo
  })
  dialogVisible.value = true
}

async function submit(): Promise<void> {
  if (!form.trenchId) {
    ElMessage.warning('请选择所属探方')
    return
  }
  if (!form.code.trim()) {
    ElMessage.warning('请填写单位号（如 H12、L03）')
    return
  }
  if (form.topDepth < 0 || form.bottomDepth < 0) {
    ElMessage.warning('深度不能为负值')
    return
  }
  const candidate = { id: editingId.value ?? uid('st'), trenchId: form.trenchId, code: form.code.trim().toUpperCase() }
  if (isCodeDuplicated(stratumState.strata, candidate)) {
    ElMessage.error(`同一探方内单位号「${candidate.code}」已存在，请更换`)
    return
  }
  const row: Stratum = {
    id: candidate.id,
    trenchId: candidate.trenchId,
    code: candidate.code,
    type: form.type,
    openLayer: form.openLayer.trim(),
    topDepth: Number(form.topDepth) || 0,
    bottomDepth: Number(form.bottomDepth) || 0,
    soil: form.soil.trim(),
    inclusions: [...form.inclusions],
    formation: form.formation.trim(),
    date: form.date,
    drawingNo: form.drawingNo.trim()
  }
  await stratumStore.getState().save(row)
  if (isDepthInverted(row)) {
    ElMessage.warning(`已保存，但「${row.code}」上界深度大于下界，层序倒置需复核`)
  } else {
    ElMessage.success(`地层单位 ${row.code} 已保存（厚 ${stratumThickness(row)} m）`)
  }
  dialogVisible.value = false
}

async function remove(stratum: Stratum): Promise<void> {
  const count = artifactState.artifacts.filter((item) => item.stratumId === stratum.id).length
  const relations = relationState.relations.filter(
    (item) => item.unitAId === stratum.id || item.unitBId === stratum.id
  ).length
  if (count > 0 || relations > 0) {
    ElMessage.error(`「${stratum.code}」下仍有 ${count} 件出土物、${relations} 条层位关系，请先清理`)
    return
  }
  await ElMessageBox.confirm(`确认删除地层单位「${stratum.code}」？`, '删除确认', { type: 'warning' })
  await stratumStore.getState().remove(stratum.id)
  ElMessage.success('地层单位已删除')
}

async function applyBatchType(): Promise<void> {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先勾选要调整的单位')
    return
  }
  await stratumStore.getState().bulkSetType(selectedIds.value, batchType.value)
  ElMessage.success(`已把 ${selectedIds.value.length} 个单位的类型调整为「${batchType.value}」`)
}

/* ---------- 合并地层单位 ---------- */

const mergeVisible = ref(false)
const mergeTrenchId = ref('')
const mergeKeepId = ref('')
const mergeRemoveId = ref('')

const mergeUnits = computed(() => stratumState.strata.filter((item) => item.trenchId === mergeTrenchId.value))
const mergeKeepOptions = computed(() => mergeUnits.value.filter((item) => item.id !== mergeRemoveId.value))
const mergeRemoveOptions = computed(() => mergeUnits.value.filter((item) => item.id !== mergeKeepId.value))

/** 实时合并计划：对话框内即时预览迁移结果或拒绝原因 */
const mergePlan = computed<MergePlan | null>(() => {
  if (!mergeKeepId.value || !mergeRemoveId.value) return null
  return planStratumMerge({
    strata: stratumState.strata,
    artifacts: artifactState.artifacts,
    relations: relationState.relations,
    keepId: mergeKeepId.value,
    removeId: mergeRemoveId.value
  })
})

function openMerge(): void {
  const picked = selectedIds.value
    .map((id) => stratumState.strata.find((item) => item.id === id))
    .filter((item): item is Stratum => Boolean(item))
  const pair = picked.length === 2 && picked[0].trenchId === picked[1].trenchId ? picked : null
  mergeTrenchId.value = pair?.[0].trenchId ?? picked[0]?.trenchId ?? filterTrenchId.value ?? ''
  if (!mergeTrenchId.value) mergeTrenchId.value = trenchState.trenches[0]?.id ?? ''
  const list = stratumState.strata.filter((item) => item.trenchId === mergeTrenchId.value)
  mergeKeepId.value = pair?.[0].id ?? list[0]?.id ?? ''
  mergeRemoveId.value = pair?.[1].id ?? list.find((item) => item.id !== mergeKeepId.value)?.id ?? ''
  mergeVisible.value = true
}

watch(mergeTrenchId, (trenchId) => {
  const list = stratumState.strata.filter((item) => item.trenchId === trenchId)
  if (!list.some((item) => item.id === mergeKeepId.value)) {
    mergeKeepId.value = list[0]?.id ?? ''
  }
  if (!list.some((item) => item.id === mergeRemoveId.value) || mergeRemoveId.value === mergeKeepId.value) {
    mergeRemoveId.value = list.find((item) => item.id !== mergeKeepId.value)?.id ?? ''
  }
})

watch(mergeKeepId, (keepId) => {
  if (mergeRemoveId.value === keepId) {
    mergeRemoveId.value = mergeUnits.value.find((item) => item.id !== keepId)?.id ?? ''
  }
})

async function confirmMerge(): Promise<void> {
  if (!mergeKeepId.value || !mergeRemoveId.value) {
    ElMessage.warning('请选择要保留与要并入的两个单位')
    return
  }
  // 以数据库最新数据重新校验：不通过则不写库，两个单位保持原样
  const plan = await stratumStore.getState().merge(mergeKeepId.value, mergeRemoveId.value)
  if (!plan.ok) {
    await ElMessageBox({
      title: '无法合并：两个单位保持原样',
      message: h(
        'ul',
        { style: 'margin:0;padding-left:18px;line-height:1.8' },
        plan.reasons.map((reason) => h('li', reason))
      ),
      confirmButtonText: '知道了',
      type: 'error'
    })
    return
  }
  await Promise.all([artifactStore.getState().hydrate(), relationStore.getState().hydrate()])
  selectedIds.value = selectedIds.value.filter((id) => id !== plan.remove?.id)
  ElMessage.success(
    `已把「${plan.remove?.code}」并入「${plan.keep?.code}」：迁移出土物 ${plan.movedArtifacts.length} 件、层位关系 ${plan.updatedRelations.length} 条，归并重复关系 ${plan.removedRelationIds.length} 条`
  )
  mergeVisible.value = false
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">地层单位编目表</h2>
        <p class="page-sub">
          按类型与深度区间筛选；层序倒置（上界大于下界）与同一探方内单位号重复即时高亮提示，深度刻度条展示厚度。误拆的单位可勾选两行后点「合并单位」并入保留编号。
        </p>
      </div>
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon>新建地层单位
      </el-button>
    </div>

    <el-alert
      v-if="order.inverted.length > 0 || order.duplicateCodes.length > 0"
      class="alert"
      type="warning"
      :closable="false"
      show-icon
      :title="`发现 ${order.inverted.length} 个层序倒置单位、${order.duplicateCodes.length} 个重复单位号`"
    >
      <template #default>
        <p v-if="order.inverted.length > 0">
          层序倒置：{{ order.inverted.map((item) => item.code).join('、') }}（上界深度大于下界深度）
        </p>
        <p v-if="order.duplicateCodes.length > 0">单位号重复：{{ order.duplicateCodes.join('、') }}</p>
        <p v-if="order.conflicts.length > 0">
          与层位关系矛盾：{{ order.conflicts.join('；') }}
        </p>
      </template>
    </el-alert>
    <el-alert
      v-else
      class="alert"
      type="success"
      :closable="false"
      show-icon
      title="层序与单位号校验通过"
    />

    <div class="toolbar">
      <el-select v-model="filterTrenchId" placeholder="全部探方" clearable style="width: 190px">
        <el-option v-for="trench in trenchState.trenches" :key="trench.id" :label="`${trench.area} · ${trench.code}`" :value="trench.id" />
      </el-select>
      <el-select v-model="filterType" placeholder="全部类型" clearable style="width: 130px">
        <el-option v-for="type in UNIT_TYPES" :key="type" :label="type" :value="type" />
      </el-select>
      <div class="depth">
        <span class="muted">深度区间（米）</span>
        <el-input-number v-model="depthFrom" :min="0" :step="0.1" :controls="false" placeholder="起" style="width: 100px" />
        <span>—</span>
        <el-input-number v-model="depthTo" :min="0" :step="0.1" :controls="false" placeholder="止" style="width: 100px" />
      </div>
      <el-select v-model="batchType" style="width: 130px">
        <el-option v-for="type in UNIT_TYPES" :key="type" :label="type" :value="type" />
      </el-select>
      <el-button type="primary" plain @click="applyBatchType">批量调整类型</el-button>
      <el-button type="warning" plain @click="openMerge">
        <el-icon><Connection /></el-icon>合并单位
      </el-button>
      <el-tag type="info" effect="plain">命中 {{ visible.length }} / {{ stratumState.strata.length }} 个单位</el-tag>
    </div>

    <el-table
      :data="visible"
      border
      stripe
      row-key="id"
      :row-class-name="rowClass"
      @selection-change="(rows: Stratum[]) => (selectedIds = rows.map((row) => row.id))"
    >
      <el-table-column type="selection" width="46" />
      <el-table-column label="序号" width="70">
        <template #default="{ row }: { row: Stratum }">{{ order.indexOf.get(row.id) ?? '—' }}</template>
      </el-table-column>
      <el-table-column label="探方" width="150">
        <template #default="{ row }: { row: Stratum }">
          <span class="mono">{{ trenchLabel(row.trenchId) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="单位号" width="110">
        <template #default="{ row }: { row: Stratum }">
          <span class="mono">{{ row.code }}</span>
          <el-tag v-if="duplicatedOf(row)" type="warning" size="small" effect="dark" class="mini">重复</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="120">
        <template #default="{ row }: { row: Stratum }">
          <TrenchTag :unit-type="row.type" size="small" />
        </template>
      </el-table-column>
      <el-table-column label="深度刻度" width="250">
        <template #default="{ row }: { row: Stratum }">
          <StratumDepthBar :stratum="row" :length="180" />
        </template>
      </el-table-column>
      <el-table-column label="开口层位" width="110" prop="openLayer" />
      <el-table-column label="土质土色" min-width="150" prop="soil" show-overflow-tooltip />
      <el-table-column label="包含物" width="150">
        <template #default="{ row }: { row: Stratum }">
          <el-tag v-for="item in row.inclusions" :key="item" size="small" effect="plain" class="mini">{{ item }}</el-tag>
          <span v-if="row.inclusions.length === 0" class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="出土物" width="90">
        <template #default="{ row }: { row: Stratum }">{{ artifactsOf(row.id) }} 件</template>
      </el-table-column>
      <el-table-column label="校验" width="110">
        <template #default="{ row }: { row: Stratum }">
          <el-tag v-if="invertedOf(row)" type="danger" size="small" effect="dark">层序倒置</el-tag>
          <el-tag v-else-if="conflictOf(row.code)" type="warning" size="small" effect="dark">关系矛盾</el-tag>
          <el-tag v-else type="success" size="small" effect="plain">正常</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }: { row: Stratum }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑地层单位' : '新建地层单位'" width="680px">
      <el-form label-width="110px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="所属探方" required>
              <el-select v-model="form.trenchId" style="width: 100%">
                <el-option v-for="trench in trenchState.trenches" :key="trench.id" :label="`${trench.area} · ${trench.code}`" :value="trench.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单位号" required>
              <el-input v-model="form.code" placeholder="如 H12、L03" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="单位类型">
              <el-select v-model="form.type" style="width: 100%">
                <el-option v-for="type in UNIT_TYPES" :key="type" :label="type" :value="type" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="开口层位">
              <el-input v-model="form.openLayer" placeholder="如 第②层下" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="上界深度(m)">
              <el-input-number v-model="form.topDepth" :min="0" :step="0.05" :precision="2" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="下界深度(m)">
              <el-input-number v-model="form.bottomDepth" :min="0" :step="0.05" :precision="2" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="厚度">
              <el-input :model-value="`${Math.abs(form.bottomDepth - form.topDepth).toFixed(2)} m`" disabled />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="土质土色">
          <el-input v-model="form.soil" placeholder="如 灰褐色砂质黏土，疏松" />
        </el-form-item>
        <el-form-item label="包含物">
          <el-checkbox-group v-model="form.inclusions">
            <el-checkbox v-for="item in INCLUSIONS" :key="item" :value="item">{{ item }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="堆积成因">
          <el-input v-model="form.formation" placeholder="如 生活垃圾坑" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="发掘日期">
              <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="绘图/拍照号">
              <el-input v-model="form.drawingNo" placeholder="如 T0501-北壁-02" />
            </el-form-item>
          </el-col>
        </el-row>
        <p v-if="form.topDepth > form.bottomDepth" class="warn">上界深度大于下界深度，保存后将标记为「层序倒置」</p>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="mergeVisible" title="合并地层单位" width="640px">
      <el-alert
        class="merge-tip"
        type="info"
        :closable="false"
        show-icon
        title="把误拆的单位并入保留编号：出土物与层位关系整体迁移，重复关系自动归并，并入单位随后从编目表删除。"
      />
      <el-form label-width="110px">
        <el-form-item label="所属探方" required>
          <el-select v-model="mergeTrenchId" style="width: 100%">
            <el-option v-for="trench in trenchState.trenches" :key="trench.id" :label="`${trench.area} · ${trench.code}`" :value="trench.id" />
          </el-select>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="保留编号" required>
              <el-select v-model="mergeKeepId" filterable style="width: 100%">
                <el-option
                  v-for="item in mergeKeepOptions"
                  :key="item.id"
                  :label="`${item.code}（${item.type} · ${item.topDepth}–${item.bottomDepth} m）`"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="并入单位" required>
              <el-select v-model="mergeRemoveId" filterable style="width: 100%">
                <el-option
                  v-for="item in mergeRemoveOptions"
                  :key="item.id"
                  :label="`${item.code}（${item.type} · ${item.topDepth}–${item.bottomDepth} m）`"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <div v-if="mergePlan && mergePlan.ok" class="merge-preview ok">
        <p>保存前检查通过，合并后：</p>
        <ul>
          <li>{{ mergePlan.movedArtifacts.length }} 件出土物改属「{{ mergePlan.keep?.code }}」</li>
          <li>
            {{ mergePlan.updatedRelations.length }} 条层位关系迁入「{{ mergePlan.keep?.code }}」<template v-if="mergePlan.removedRelationIds.length > 0">，归并重复关系 {{ mergePlan.removedRelationIds.length }} 条</template>
          </li>
          <li>单位「{{ mergePlan.remove?.code }}」从编目表删除，关系图与剖面立即按「{{ mergePlan.keep?.code }}」显示</li>
        </ul>
      </div>
      <div v-else-if="mergePlan" class="merge-preview bad">
        <p>保存前检查未通过，两个单位将保持原样：</p>
        <ul>
          <li v-for="reason in mergePlan.reasons" :key="reason">{{ reason }}</li>
        </ul>
      </div>
      <p v-else class="muted">该探方至少需要两个地层单位才能合并；请在编目表中先录入或勾选两个单位。</p>

      <template #footer>
        <el-button @click="mergeVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!mergeKeepId || !mergeRemoveId" @click="confirmMerge">确认合并</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.alert {
  margin-bottom: 14px;
}
.depth {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mini {
  margin-left: 4px;
}
.warn {
  margin: 0;
  color: #c0392b;
  font-size: 12px;
}
.merge-tip {
  margin-bottom: 14px;
}
.merge-preview {
  margin: 4px 0 0;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.8;
}
.merge-preview p {
  margin: 0 0 4px;
  font-weight: 600;
}
.merge-preview ul {
  margin: 0;
  padding-left: 18px;
}
.merge-preview.ok {
  background: #f0f7ec;
  border: 1px solid #cfe3c4;
  color: #3d6b2f;
}
.merge-preview.bad {
  background: #fdf2f2;
  border: 1px solid #f0c9c4;
  color: #a33a2c;
}
</style>
