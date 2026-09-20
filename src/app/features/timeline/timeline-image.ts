import { STATUS_LIST, STATUS_MAP, THAI_MONTHS } from '../../core/models/status.constant';
import { fiscalMonths, monthPositionInFiscalYears, todayIso } from '../../shared/utils/date.util';
import { elapsedFraction, TimelineLayout } from './timeline.util';

export interface TimelineImage {
  /** PNG data URL, drawn at 2x for sharpness. */
  dataUrl: string;
  /** Size in CSS pixels, i.e. how large the picture should be shown. */
  width: number;
  height: number;
}

const SCALE = 2;
const FONT = "'Noto Sans Thai', 'Segoe UI', Tahoma, sans-serif";

const NAME_W = 300;
const MONTH_W = 48;
const FISCAL_HEADER_H = 28;
const MONTH_HEADER_H = 40;
const PROJECT_ROW_H = 34;
const ACTIVITY_ROW_H = 28;
const EMPTY_BODY_H = 64;
const LEGEND_H = 40;

const COLOR = {
  text: '#0f172a',
  textSoft: '#334155',
  muted: '#64748b',
  faint: '#94a3b8',
  headerBg: '#f8fafc',
  activityBg: '#f8fafc',
  selectedBg: '#eff6ff',
  selectedText: '#1d4ed8',
  line: '#e2e8f0',
  lineFaint: '#f1f5f9',
  lineYear: '#cbd5e1',
  todayLine: '#2563eb',
  todayBand: 'rgba(59, 130, 246, 0.09)',
  todayHeaderBg: '#dbeafe',
  hatch: 'rgba(255, 255, 255, 0.7)',
  swatch: '#cbd5e1',
};

const HATCH_GAP = 10;
const HATCH_WIDTH = 5;

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) cut = cut.slice(0, -1);
  return cut + '…';
}

/** Makes sure the web font is ready before drawing; canvas text silently falls back if it is not. */
async function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([400, 600, 700].map((w) => document.fonts.load(`${w} 13px "Noto Sans Thai"`, 'ก')));
  } catch {
    // fall back to whatever font the browser has
  }
}

/**
 * Fills a rounded bar with `color`: solid up to `elapsed` (0 to 1) of its width, hatched after that, like the
 * Timeline page shows time already gone by against time still to come.
 */
function fillBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  elapsed: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  const splitX = x + w * elapsed;
  if (splitX < x + w) {
    ctx.beginPath();
    ctx.rect(splitX, y, x + w - splitX, h);
    ctx.clip();
    ctx.strokeStyle = COLOR.hatch;
    ctx.lineWidth = HATCH_WIDTH;
    ctx.beginPath();
    // 45-degree stripes across the part still to come (the clip keeps them inside the bar)
    for (let sx = splitX - h; sx < x + w + h; sx += HATCH_GAP) {
      ctx.moveTo(sx, y + h);
      ctx.lineTo(sx + h, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws the timeline (the same rows, months and today marker as the Timeline page) as a picture, so it can
 * be placed in an Excel file. Reads only the layout, so it works from any page.
 */
export async function renderTimelineImage(
  layout: TimelineLayout,
  selectedYear: number,
  today: string = todayIso(),
): Promise<TimelineImage> {
  await loadFonts();
  const fiscalYears = Array.from({ length: layout.lastYear - layout.firstYear + 1 }, (_, i) => layout.firstYear + i);
  const monthCount = fiscalYears.length * 12;
  const headerH = FISCAL_HEADER_H + MONTH_HEADER_H;
  const bodyH = layout.rows.length
    ? layout.rows.reduce((h, r) => h + (r.activity ? ACTIVITY_ROW_H : PROJECT_ROW_H), 0)
    : EMPTY_BODY_H;
  const width = NAME_W + monthCount * MONTH_W;
  const height = headerH + bodyH + LEGEND_H;

  // Today's place on the axis, in months from October of the first fiscal year.
  const todayPosition = monthPositionInFiscalYears(today, layout.firstYear) ?? -1;
  const currentMonth = todayPosition >= 0 && todayPosition < monthCount ? Math.floor(todayPosition) : -1;

  const canvas = document.createElement('canvas');
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('สร้างรูป Timeline ไม่สำเร็จ');
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'middle';

  const line = (x1: number, y1: number, x2: number, y2: number, color: string, w = 1) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // ----- header -----
  ctx.fillStyle = COLOR.headerBg;
  ctx.fillRect(0, 0, width, headerH);

  ctx.textAlign = 'left';
  ctx.fillStyle = COLOR.muted;
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText('ชื่อโครงการ', 16, FISCAL_HEADER_H + MONTH_HEADER_H / 2);

  fiscalYears.forEach((fiscalYear, i) => {
    const x0 = NAME_W + i * 12 * MONTH_W;
    if (fiscalYear === selectedYear) {
      ctx.fillStyle = COLOR.selectedBg;
      ctx.fillRect(x0, 0, 12 * MONTH_W, FISCAL_HEADER_H);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = fiscalYear === selectedYear ? COLOR.selectedText : COLOR.muted;
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText(`ปีงบประมาณ ${fiscalYear}`, x0 + 6 * MONTH_W, FISCAL_HEADER_H / 2 + 1);

    fiscalMonths(fiscalYear).forEach((m, j) => {
      const cx = x0 + j * MONTH_W + MONTH_W / 2;
      const isCurrent = i * 12 + j === currentMonth;
      if (isCurrent) {
        ctx.fillStyle = COLOR.todayHeaderBg;
        ctx.fillRect(x0 + j * MONTH_W, FISCAL_HEADER_H, MONTH_W, MONTH_HEADER_H);
      }
      ctx.fillStyle = isCurrent ? COLOR.selectedText : COLOR.muted;
      ctx.font = `700 12px ${FONT}`;
      ctx.fillText(THAI_MONTHS[m.month], cx, FISCAL_HEADER_H + 14);
      ctx.fillStyle = isCurrent ? COLOR.selectedText : COLOR.faint;
      ctx.font = `400 10px ${FONT}`;
      ctx.fillText(((m.year + 543) % 100).toString().padStart(2, '0'), cx, FISCAL_HEADER_H + 29);
    });
  });
  line(0, headerH, width, headerH, COLOR.line);

  // ----- rows: backgrounds, then the grid, then names and bars, so the grid never cuts across a bar -----
  const rowTops: number[] = [];
  let y = headerH;
  for (const row of layout.rows) {
    rowTops.push(y);
    y += row.activity ? ACTIVITY_ROW_H : PROJECT_ROW_H;
  }

  if (layout.rows.length === 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR.faint;
    ctx.font = `400 13px ${FONT}`;
    ctx.fillText('ไม่มีโครงการ', 16, headerH + EMPTY_BODY_H / 2);
  }
  layout.rows.forEach((row, i) => {
    if (row.activity) {
      ctx.fillStyle = COLOR.activityBg;
      ctx.fillRect(0, rowTops[i], width, ACTIVITY_ROW_H);
    }
  });

  // tint over the current month's column
  if (currentMonth >= 0) {
    ctx.fillStyle = COLOR.todayBand;
    ctx.fillRect(NAME_W + currentMonth * MONTH_W, headerH, MONTH_W, bodyH);
  }

  // month hairlines, heavier where a fiscal year begins
  for (let m = 0; m <= monthCount; m++) {
    const x = NAME_W + m * MONTH_W;
    const yearStart = m % 12 === 0;
    line(x, yearStart ? 0 : FISCAL_HEADER_H, x, headerH + bodyH, yearStart ? COLOR.lineYear : COLOR.lineFaint, yearStart ? 2 : 1);
  }
  line(NAME_W, 0, NAME_W, headerH + bodyH, COLOR.line);
  rowTops.forEach((top, i) => {
    const bottom = top + (layout.rows[i].activity ? ACTIVITY_ROW_H : PROJECT_ROW_H);
    line(0, bottom, width, bottom, COLOR.lineFaint);
  });

  layout.rows.forEach((row, i) => {
    const isActivity = !!row.activity;
    const rowH = isActivity ? ACTIVITY_ROW_H : PROJECT_ROW_H;
    const top = rowTops[i];

    ctx.textAlign = 'left';
    ctx.fillStyle = isActivity ? COLOR.textSoft : COLOR.text;
    ctx.font = isActivity ? `400 12px ${FONT}` : `700 13px ${FONT}`;
    const x = isActivity ? 32 : 16;
    ctx.fillText(truncate(ctx, row.name, NAME_W - x - 12), x, top + rowH / 2);

    if (row.span) {
      const meta = STATUS_MAP[row.status];
      const barX = NAME_W + (row.span[0] - 1) * MONTH_W + 3;
      const barW = (row.span[1] - row.span[0] + 1) * MONTH_W - 6;
      const barH = isActivity ? 16 : 22;
      fillBar(ctx, barX, top + (rowH - barH) / 2, barW, barH, meta.bg, elapsedFraction(row.span, todayPosition));

      // The label goes inside the bar only when it fits with padding; it is never clipped.
      ctx.font = `700 11px ${FONT}`;
      if (ctx.measureText(meta.label).width + 16 <= barW) {
        ctx.fillStyle = meta.text;
        ctx.textAlign = 'left';
        ctx.fillText(meta.label, barX + 8, top + rowH / 2);
      }
    }
  });

  // the line for today, over the bars
  if (currentMonth >= 0) {
    const x = NAME_W + todayPosition * MONTH_W;
    line(x, headerH, x, headerH + bodyH, COLOR.todayLine, 2);
  }

  // ----- legend -----
  const legendY = headerH + bodyH;
  line(0, legendY, width, legendY, COLOR.line);
  ctx.textAlign = 'left';
  ctx.font = `600 12px ${FONT}`;
  ctx.fillStyle = COLOR.muted;
  ctx.fillText('สถานะ:', 16, legendY + LEGEND_H / 2);
  let lx = 16 + ctx.measureText('สถานะ:').width + 16;
  ctx.font = `400 12px ${FONT}`;
  for (const s of STATUS_LIST) {
    ctx.fillStyle = s.dot;
    ctx.beginPath();
    ctx.arc(lx + 5, legendY + LEGEND_H / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLOR.textSoft;
    ctx.fillText(s.label, lx + 16, legendY + LEGEND_H / 2);
    lx += 16 + ctx.measureText(s.label).width + 20;
  }

  // what the bars and the highlighted column mean
  lx += 8;
  const swatchY = legendY + (LEGEND_H - 12) / 2;
  const swatches: { label: string; draw: (x: number) => void }[] = [
    { label: 'ผ่านมาแล้ว', draw: (x) => fillBar(ctx, x, swatchY, 24, 12, COLOR.swatch, 1) },
    { label: 'ยังไม่ถึง', draw: (x) => fillBar(ctx, x, swatchY, 24, 12, COLOR.swatch, 0) },
    {
      label: 'เดือนปัจจุบัน',
      draw: (x) => {
        ctx.fillStyle = COLOR.todayHeaderBg;
        ctx.fillRect(x + 6, swatchY, 12, 12);
        ctx.strokeStyle = COLOR.todayLine;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 6.5, swatchY + 0.5, 11, 11);
      },
    },
  ];
  for (const item of swatches) {
    item.draw(lx);
    ctx.fillStyle = COLOR.textSoft;
    ctx.textAlign = 'left';
    ctx.font = `400 12px ${FONT}`;
    ctx.fillText(item.label, lx + 32, legendY + LEGEND_H / 2);
    lx += 32 + ctx.measureText(item.label).width + 20;
  }

  return { dataUrl: canvas.toDataURL('image/png'), width, height };
}
