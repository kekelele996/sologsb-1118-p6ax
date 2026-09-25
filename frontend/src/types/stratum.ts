/** 单位类型 */
export const UNIT_TYPES = ['地层', '灰坑', '房址', '沟', '墓葬'] as const
export type UnitType = (typeof UNIT_TYPES)[number]

/** 包含物 */
export const INCLUSIONS = ['陶片', '骨', '炭屑', '石器'] as const
export type Inclusion = (typeof INCLUSIONS)[number]

/** Stratum 地层单位 */
export interface Stratum {
  id: string
  trenchId: string
  /** 单位号，如 H12、L03 */
  code: string
  type: UnitType
  /** 开口层位 */
  openLayer: string
  /** 距地表深度上界（米） */
  topDepth: number
  /** 距地表深度下界（米） */
  bottomDepth: number
  /** 土质土色 */
  soil: string
  inclusions: Inclusion[]
  /** 堆积成因推测 */
  formation: string
  date: string
  /** 绘图与拍照编号 */
  drawingNo: string
}

/** 厚度（米） */
export function stratumThickness(stratum: Pick<Stratum, 'topDepth' | 'bottomDepth'>): number {
  return Math.round(Math.abs(stratum.bottomDepth - stratum.topDepth) * 100) / 100
}

/** 层序是否倒置：上界深度大于下界深度即倒置 */
export function isDepthInverted(stratum: Pick<Stratum, 'topDepth' | 'bottomDepth'>): boolean {
  return stratum.topDepth > stratum.bottomDepth
}

/** 单位号在同一探方内是否重复 */
export function isCodeDuplicated(strata: Stratum[], candidate: Pick<Stratum, 'id' | 'trenchId' | 'code'>): boolean {
  return strata.some(
    (item) =>
      item.id !== candidate.id &&
      item.trenchId === candidate.trenchId &&
      item.code.trim().toUpperCase() === candidate.code.trim().toUpperCase()
  )
}
