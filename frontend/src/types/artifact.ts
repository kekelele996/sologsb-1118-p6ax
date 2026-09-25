/** 器物类别 */
export const ARTIFACT_CATEGORIES = ['陶器', '瓷器', '石器', '骨器', '铜器'] as const
export type ArtifactCategory = (typeof ARTIFACT_CATEGORIES)[number]

/** 残整程度 */
export const COMPLETENESS = ['完整', '可复原', '残片'] as const
export type Completeness = (typeof COMPLETENESS)[number]

/** Artifact 出土物 */
export interface Artifact {
  id: string
  /** 所属地层单位（登记时锁定） */
  stratumId: string
  /** 器物编号 */
  code: string
  category: ArtifactCategory
  /** 件数 */
  count: number
  completeness: Completeness
  /** 探方内坐标 X（米） */
  x: number
  /** 探方内坐标 Y（米） */
  y: number
  /** 探方内坐标 Z（距地表深度，米） */
  z: number
  date: string
  /** 提取人 */
  collector: string
  /** 临时存放位置 */
  tempLocation: string
}
