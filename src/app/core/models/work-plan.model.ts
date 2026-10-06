export type WorkStatus = 'planned' | 'in-progress' | 'completed' | 'delayed' | 'cancelled';

/** One small step in an activity's to-do list. */
export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

/** A sub-activity of a project (กิจกรรมย่อย). */
export interface Activity {
  id: string;
  name: string;
  description?: string;
  /** The responsible person's name; with `responsibleId` it is that account's name (kept current by WorkPlanService). */
  responsible?: string;
  /** The account responsible for the activity; it may then see and edit the whole project. */
  responsibleId?: string;
  startDate: string; // ISO yyyy-MM-dd
  endDate: string; // ISO yyyy-MM-dd
  status: WorkStatus;
  /** Remark (หมายเหตุ), e.g. why the status was changed. */
  note?: string;
  /** The activity's own to-do list; older saved data has none. */
  todos?: TodoItem[];
}

/** A project (โครงการ). Named WorkPlan in code; older saved data has no `activities`. */
export interface WorkPlan {
  id: string;
  /** Fiscal year (ปีงบประมาณ, พ.ศ.) of the start date: October 2568 – September 2569 is 2569. */
  year: number;
  name: string;
  description?: string;
  type: string;
  /**
   * The responsible person's name; with `responsibleId` it is that account's name (kept current by WorkPlanService).
   * Data saved before accounts existed has only a typed-in name.
   */
  responsible: string;
  /** The account responsible for the project; it may see and edit it (but not delete it). */
  responsibleId?: string;
  /** Always the first day of the start month (projects are planned by month). ISO yyyy-MM-dd */
  startDate: string;
  /** Always the last day of the end month. ISO yyyy-MM-dd */
  endDate: string;
  status: WorkStatus;
  activities?: Activity[];
  /** The account that created the project; missing only on data saved before accounts existed. */
  ownerId?: string;
  createdAt: string;
  updatedAt: string;
}

/** The owner is set by WorkPlanService, never by a form. */
export type WorkPlanInput = Omit<WorkPlan, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'>;
