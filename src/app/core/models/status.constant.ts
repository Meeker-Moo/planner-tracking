import { WorkStatus } from './work-plan.model';

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
