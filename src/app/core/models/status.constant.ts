import { WorkStatus } from './work-plan.model';
import { CalendarEvent, EventPriority } from './calendar-event.model';

export interface StatusMeta {
  value: WorkStatus;
  label: string;
  bg: string;
  text: string;
  dot: string;
}

export const STATUS_LIST: StatusMeta[] = [
  { value: 'planned', label: 'วางแผน', bg: '#DBEAFE', text: '#1D4ED8', dot: '#2563EB' },
  { value: 'in-progress', label: 'กำลังดำเนินการ', bg: '#FEF3C7', text: '#B45309', dot: '#D97706' },
  { value: 'completed', label: 'เสร็จสิ้น', bg: '#D1FAE5', text: '#047857', dot: '#059669' },
  { value: 'delayed', label: 'ล่าช้า', bg: '#FEE2E2', text: '#B91C1C', dot: '#DC2626' },
  { value: 'cancelled', label: 'ยกเลิก', bg: '#E5E7EB', text: '#4B5563', dot: '#6B7280' },
];

export const STATUS_MAP: Record<WorkStatus, StatusMeta> = STATUS_LIST.reduce(
  (acc, s) => ({ ...acc, [s.value]: s }),
  {} as Record<WorkStatus, StatusMeta>,
);

export interface PriorityMeta {
  value: EventPriority;
  label: string;
  bg: string;
  text: string;
  dot: string;
}

/** Most pressing first — the order the choices appear in and the order events are listed in. */
export const EVENT_PRIORITY_LIST: PriorityMeta[] = [
  { value: 'urgent', label: 'ด่วน', bg: '#FEE2E2', text: '#B91C1C', dot: '#EF4444' },
  { value: 'adhoc', label: 'งานแทรก', bg: '#F3E8FF', text: '#7E22CE', dot: '#A855F7' },
  { value: 'normal', label: 'ปกติ', bg: '#DBEAFE', text: '#1D4ED8', dot: '#3B82F6' },
  { value: 'low', label: 'ไม่ด่วน', bg: '#DCFCE7', text: '#15803D', dot: '#22C55E' },
];

export const DEFAULT_EVENT_PRIORITY: EventPriority = 'normal';

export const EVENT_PRIORITY_MAP: Record<EventPriority, PriorityMeta> = EVENT_PRIORITY_LIST.reduce(
  (acc, p) => ({ ...acc, [p.value]: p }),
  {} as Record<EventPriority, PriorityMeta>,
);

/** The three priorities of the first version, mapped to the current ones ('low' kept its name). */
const LEGACY_PRIORITIES: Record<string, EventPriority> = { high: 'urgent', medium: 'normal' };

/** A saved priority read as a current one; undefined when it is missing or unknown. */
export function toEventPriority(value: unknown): EventPriority | undefined {
  if (typeof value !== 'string') return undefined;
  return value in EVENT_PRIORITY_MAP ? (value as EventPriority) : LEGACY_PRIORITIES[value];
}

/** The event's priority, treating events saved before priorities existed as the default. */
export function eventPriority(event: Pick<CalendarEvent, 'priority'>): PriorityMeta {
  return EVENT_PRIORITY_MAP[event.priority ?? DEFAULT_EVENT_PRIORITY] ?? EVENT_PRIORITY_MAP[DEFAULT_EVENT_PRIORITY];
}

export const WORK_TYPES: string[] = ['วางแผน', 'พัฒนาบุคลากร', 'ตรวจสอบ', 'กิจกรรม', 'การเงิน', 'อื่นๆ'];

export const THAI_MONTHS: string[] = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

export const THAI_MONTHS_FULL: string[] = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export const THAI_WEEKDAYS_SHORT: string[] = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
