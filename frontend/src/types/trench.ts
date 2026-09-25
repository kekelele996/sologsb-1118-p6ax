/** 探方规格 */
export const TRENCH_SIZES = ['5×5 米', '10×10 米', '5×10 米', '2×10 米'] as const
export type TrenchSize = (typeof TRENCH_SIZES)[number]

/** Trench 探方 */
export interface Trench {
  id: string
  /** 探方号，如 T0501 */
  code: string
  /** 发掘区 */
  area: string
  size: TrenchSize
  /** 基点坐标（如 N1200 / E3000） */
  basePoint: string
  /** 开口层位 */
  openLayer: string
  startDate: string
  endDate: string
  /** 负责人 */
  leader: string
  /** 四壁方向备注 */
  wallNote: string
  /** 是否已回填 */
  backfilled: boolean
}

/** 探方唯一键：发掘区-探方号 */
export function trenchKey(trench: Pick<Trench, 'area' | 'code'>): string {
  return `${trench.area.trim()}-${trench.code.trim().toUpperCase()}`
}

/** 校验探方唯一性，返回冲突的探方（无冲突返回 null） */
export function findTrenchConflict(trenches: Trench[], candidate: Pick<Trench, 'id' | 'area' | 'code'>): Trench | null {
  const key = trenchKey(candidate)
  return trenches.find((item) => item.id !== candidate.id && trenchKey(item) === key) ?? null
}
