import { Injectable } from '@angular/core';
import { Activity, TodoItem, WorkPlan } from '../models/work-plan.model';
import { STATUS_MAP } from '../models/status.constant';
import {
  fiscalYearRangeLabel,
  formatDateThai,
  formatMonthYearThai,
  withFiscalYear,
} from '../../shared/utils/date.util';
import { todoProgress } from '../../shared/utils/activity.util';
import { downloadBlob } from '../../shared/utils/file.util';
import { uid } from '../../shared/utils/id.util';
import { renderTimelineImage } from '../../features/timeline/timeline-image';
import { buildTimelineLayout } from '../../features/timeline/timeline.util';

function isTodo(item: unknown): boolean {
  return !!item && typeof item === 'object' && typeof (item as TodoItem).text === 'string';
}

function isActivity(item: unknown): boolean {
  return (
    !!item &&
    typeof item === 'object' &&
    typeof (item as Activity).name === 'string' &&
    typeof (item as Activity).startDate === 'string' &&
    typeof (item as Activity).endDate === 'string' &&
    ((item as Activity).todos === undefined ||
      (Array.isArray((item as Activity).todos) && (item as Activity).todos!.every(isTodo)))
  );
}

/** Hand-written files may lack ids or the done flag on activities and their to-do items. */
function normalizeActivity(activity: Activity): Activity {
  return {
    ...activity,
    id: activity.id ?? uid(),
    todos: activity.todos?.map((t) => ({ ...t, id: t.id ?? uid(), done: !!t.done })),
  };
}

type ExcelJs = typeof import('exceljs');

// ExcelJS is large, so it is fetched only when someone exports to Excel.
async function loadExcelJs(): Promise<ExcelJs> {
  const mod = await import('exceljs');
  return (mod as { default?: ExcelJs }).default ?? mod;
}

@Injectable({ providedIn: 'root' })
export class ExportImportService {
  exportJson(plans: WorkPlan[], year: number): void {
    const blob = new Blob([JSON.stringify(plans, null, 2)], { type: 'application/json' });
    this.download(blob, `annual-work-plan-${year}.json`);
  }

  async importJson(file: File): Promise<WorkPlan[]> {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('ไฟล์ไม่ใช่ JSON ที่ถูกต้อง');
    }
    if (!Array.isArray(parsed)) {
      throw new Error('รูปแบบ JSON ต้องเป็น array ของโครงการ');
    }
    const valid = parsed.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof (item as WorkPlan).name === 'string' &&
        typeof (item as WorkPlan).startDate === 'string' &&
        typeof (item as WorkPlan).endDate === 'string',
    );
    if (!valid) {
      throw new Error('ข้อมูลบางรายการไม่ครบฟิลด์ที่จำเป็น (name, startDate, endDate)');
    }
    const activitiesValid = (parsed as WorkPlan[]).every(
      (p) => p.activities === undefined || (Array.isArray(p.activities) && p.activities.every(isActivity)),
    );
    if (!activitiesValid) {
      throw new Error('ข้อมูลกิจกรรมย่อยบางรายการไม่ครบฟิลด์ที่จำเป็น (name, startDate, endDate, todos[].text)');
    }
    // Files from older versions carry a calendar year and no activities.
    return (parsed as WorkPlan[]).map((p) =>
      withFiscalYear(p.activities ? { ...p, activities: p.activities.map(normalizeActivity) } : p),
    );
  }

  /**
   * Sheets: the projects, their sub-activities (if any), and a picture of the timeline — the same
   * months and bars as the Timeline page, widened over every fiscal year a project runs into.
   */
  async exportExcel(plans: WorkPlan[], year: number): Promise<void> {
    try {
      const layout = buildTimelineLayout(plans, year);
      const [{ Workbook }, timeline] = await Promise.all([loadExcelJs(), renderTimelineImage(layout, year)]);

      const workbook = new Workbook();
      const header = (sheet: import('exceljs').Worksheet) => {
        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
      };

      const projects = workbook.addWorksheet(`ปีงบ ${year}`);
      projects.columns = [
        { header: 'ชื่อโครงการ', key: 'name', width: 38 },
        { header: 'ประเภทโครงการ', key: 'type', width: 18 },
        { header: 'ผู้รับผิดชอบ', key: 'responsible', width: 22 },
        { header: 'ปีงบประมาณ', key: 'year', width: 13 },
        { header: 'เดือนที่เริ่ม', key: 'start', width: 16 },
        { header: 'เดือนที่สิ้นสุด', key: 'end', width: 16 },
        { header: 'สถานะ', key: 'status', width: 16 },
        { header: 'กิจกรรมย่อย (เสร็จ/ทั้งหมด)', key: 'activities', width: 26 },
        { header: 'รายละเอียด', key: 'description', width: 44 },
      ];
      projects.addRows(
        plans.map((p) => ({
          name: p.name,
          type: p.type,
          responsible: p.responsible,
          year: p.year,
          start: formatMonthYearThai(p.startDate),
          end: formatMonthYearThai(p.endDate),
          status: STATUS_MAP[p.status]?.label ?? p.status,
          activities: p.activities?.length
            ? `${p.activities.filter((a) => a.status === 'completed').length}/${p.activities.length}`
            : '',
          description: p.description ?? '',
        })),
      );
      header(projects);
      projects.getColumn('description').alignment = { wrapText: true, vertical: 'top' };

      const activityRows = plans.flatMap((p) =>
        (p.activities ?? []).map((a) => ({
          project: p.name,
          name: a.name,
          responsible: a.responsible ?? '',
          description: a.description ?? '',
          start: formatDateThai(a.startDate),
          end: formatDateThai(a.endDate),
          status: STATUS_MAP[a.status]?.label ?? a.status,
          note: a.note ?? '',
          todoProgress: a.todos?.length ? `${todoProgress(a).done}/${todoProgress(a).total}` : '',
          todos: (a.todos ?? []).map((t) => `${t.done ? '☑' : '☐'} ${t.text}`).join('\n'),
        })),
      );
      if (activityRows.length > 0) {
        const activities = workbook.addWorksheet(`กิจกรรมย่อย ${year}`);
        activities.columns = [
          { header: 'ชื่อโครงการ', key: 'project', width: 38 },
          { header: 'กิจกรรมย่อย', key: 'name', width: 34 },
          { header: 'ผู้รับผิดชอบ', key: 'responsible', width: 22 },
          { header: 'รายละเอียด', key: 'description', width: 40 },
          { header: 'วันที่เริ่ม', key: 'start', width: 20 },
          { header: 'วันที่สิ้นสุด', key: 'end', width: 20 },
          { header: 'สถานะ', key: 'status', width: 16 },
          { header: 'หมายเหตุ', key: 'note', width: 36 },
          { header: 'To do (เสร็จ/ทั้งหมด)', key: 'todoProgress', width: 20 },
          { header: 'รายการ To do', key: 'todos', width: 40 },
        ];
        activities.addRows(activityRows);
        header(activities);
        activities.getColumn('description').alignment = { wrapText: true, vertical: 'top' };
        activities.getColumn('note').alignment = { wrapText: true, vertical: 'top' };
        activities.getColumn('todos').alignment = { wrapText: true, vertical: 'top' };
      }

      const timelineSheet = workbook.addWorksheet(`Timeline ${year}`);
      const covers = layout.lastYear > layout.firstYear ? ` · แสดงต่อเนื่อง ${layout.firstYear} – ${layout.lastYear}` : '';
      timelineSheet.getCell('A1').value = `Timeline ปีงบประมาณ ${year} (${fiscalYearRangeLabel(year)})${covers}`;
      timelineSheet.getCell('A1').font = { bold: true, size: 13 };
      const imageId = workbook.addImage({ base64: timeline.dataUrl, extension: 'png' });
      timelineSheet.addImage(imageId, { tl: { col: 0, row: 2 }, ext: { width: timeline.width, height: timeline.height } });

      const buffer = await workbook.xlsx.writeBuffer();
      this.download(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `annual-work-plan-${year}.xlsx`,
      );
    } catch (err) {
      alert(`ส่งออก Excel ไม่สำเร็จ: ${err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'}`);
    }
  }

  private download(blob: Blob, filename: string): void {
    downloadBlob(blob, filename);
  }
}
