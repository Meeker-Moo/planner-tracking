# ระบบโครงการประจำปี (Annual Work Planning) — สรุปโปรเจกต์

เอกสารนี้อธิบายว่าโปรเจกต์คืออะไร ทำงานอย่างไร และมีกฎ/ข้อตัดสินใจอะไรที่ต้องรู้ก่อนแก้โค้ด
ข้อมูลตรวจกับโค้ดและผลรันจริง ณ วันที่ 20 ก.ย. 2569 (2026-09-20): `ng build` ผ่าน, `ng test` ผ่าน 68 ตัว (10 ไฟล์)

- Repo: https://github.com/Meeker-Moo/planner-tracking (public, branch `main`)
- โฟลเดอร์ทำงาน: `E:\claude_workspace\planner`
- ชื่อแพ็กเกจ: `annual-work-planning`

---

## 1. โปรเจกต์นี้คืออะไร

เว็บแอปวางแผนและติดตาม **โครงการประจำปี** ตาม **ปีงบประมาณไทย** (ต.ค.–ก.ย., ปี พ.ศ.) ใช้งานคนเดียวบนเบราว์เซอร์

- **Frontend อย่างเดียว ไม่มี backend** ข้อมูลทั้งหมดเก็บใน `localStorage` ของเบราว์เซอร์แต่ละคน
- ภาษาที่หน้าจอเป็น **ภาษาไทย** ทั้งหมด และแสดงปีเป็น **พ.ศ.** (เก็บข้อมูลเป็น ค.ศ.)
- ย้ายข้อมูลระหว่างเครื่องด้วย **ส่งออก/นำเข้า JSON**

ประวัติที่สำคัญ: เคยลองเก็บข้อมูลเป็นไฟล์ JSON แยกตามปี (มี Node server ตัวเล็ก แล้วเปลี่ยนเป็นใช้ File System Access API)
แต่ **ยกเลิกทั้งหมดแล้ว กลับมาใช้ localStorage** จึงไม่มีโค้ด server หรือโฟลเดอร์ข้อมูลใน repo (`public/data/` ถูก `.gitignore`)

## 2. เทคโนโลยี

| ส่วน | ใช้ |
|---|---|
| Framework | Angular 22 (standalone components, signals, `OnPush`, lazy routes) |
| ภาษา / สไตล์ | TypeScript 6, Tailwind CSS 4 (`@tailwindcss/postcss`), ฟอนต์ Noto Sans Thai (Google Fonts) |
| Excel | `exceljs` (โหลดแบบ lazy ตอนกดส่งออกเท่านั้น — chunk ~944 kB, ~218 kB บีบอัด) |
| ทดสอบ | Vitest ผ่าน `@angular/build:unit-test` + jsdom (`ng test`) |
| Package manager | npm (`packageManager: npm@12.0.2`), Node 24 |

`xlsx` (SheetJS) ถูกถอนออกแล้ว เพราะใส่รูปลงไฟล์ไม่ได้ — ตอนนี้ใช้ `exceljs` อย่างเดียว

## 3. หน้าต่างๆ (routes)

| Path | คอมโพเนนต์ | หน้าที่ |
|---|---|---|
| `/` | — | redirect ไป `/dashboard` (path ที่ไม่รู้จักก็ไป `/dashboard` เช่นกัน) |
| `/dashboard` | `Dashboard` | สรุปรายปีงบ: KPI 5 ช่อง, แท่งตามสถานะ/ประเภท, คอลัมน์โครงการรายเดือน (เริ่ม ต.ค.), ตารางตามผู้รับผิดชอบ, รายการ "ต้องติดตาม" (สถานะล่าช้า หรือยังไม่เสร็จทั้งที่เลยวันสิ้นสุด) |
| `/plans` | `PlanList` | รายการโครงการ: เพิ่ม/แก้ไข/ลบ, ค้นหา (ชื่อโครงการ/กิจกรรม/ผู้รับผิดชอบ), กรองเดือน/สถานะ/ประเภท, กางดูกิจกรรมใต้โครงการ (ขยายทั้งหมด/ย่อทั้งหมด), นำเข้า/ส่งออก |
| `/plans/:id` | `ProjectDetail` | รายละเอียดโครงการ + เพิ่ม/แก้ไข/ลบ **กิจกรรม** และ **to do ย่อย** ในกิจกรรม (ติ๊ก/เพิ่มได้ทันทีบนการ์ด) |
| `/timeline` | `Timeline` | ไทม์ไลน์รายเดือน ต.ค.→ก.ย. ขยายเป็นหลายปีงบถ้าโครงการคาบเกี่ยว, ไฮไลต์เดือนปัจจุบัน + เส้น "วันนี้", แถบสีทึบ=ผ่านมาแล้ว / ลายเฉียง=ยังไม่ถึง, hover ชื่อ/แถบเพื่อดูรายละเอียด |
| `/monthly-report` | `MonthlyReport` | ปฏิทินทีละเดือน กดช่องวันเพื่อเพิ่ม/แก้ไข/ลบ Event, เชื่อม Event กับโครงการ/กิจกรรม, ส่งออก/นำเข้า JSON — **แยกจากข้อมูลโครงการ** |

แถบเมนูบน (`Toolbar`, ลำดับ: Dashboard · รายการโครงการ · Timeline · Monthly Report) ใช้ร่วมทุกหน้า
มี input `showActions` (เมนูจัดการข้อมูล + ปุ่มเพิ่ม) และ `showYear` (ตัวเลือกปีงบ) เพื่อซ่อนในหน้าที่ไม่เกี่ยว
ตัวเลือก "ปีงบประมาณ" แต่ละหน้ามี state ของตัวเอง (ไม่แชร์ข้ามหน้า) ค่าเริ่มต้น = ปีงบปัจจุบัน

## 4. กฎของโดเมน (สำคัญ)

### ปีงบประมาณ
- ปีงบ = **ปี พ.ศ. ที่สิ้นสุด**: ต.ค. 2568 – ก.ย. 2569 = ปีงบ **2569**; ต.ค. 2569 – ก.ย. 2570 = **2570**
- สูตร (`fiscalYearOf` ใน `date.util.ts`): `ปี ค.ศ. + (เดือน >= ต.ค. ? 1 : 0) + 543`
- โครงการนับเข้าปีงบตาม **เดือนที่เริ่ม** ฟิลด์ `WorkPlan.year` จึง **คำนวณจาก `startDate` เสมอ** (ไม่เชื่อค่าที่เก็บไว้):
  ข้อมูลเก่า (เก็บเป็นปีปฏิทิน ค.ศ.) และไฟล์ JSON ที่นำเข้าจะถูกแปลงด้วย `withFiscalYear`
- โครงการที่คาบเกี่ยวหลายปีงบจึงอยู่ในปีงบที่ "เริ่ม" แต่ Timeline แสดงต่อเนื่องทุกปีงบที่คาบเกี่ยว

### โครงการ (Project = `WorkPlan` ในโค้ด)
- ชื่อในโค้ดยังเป็น `WorkPlan`/`WorkPlanService`/คีย์ `awp:plans:v1` (เปลี่ยนเฉพาะข้อความบนหน้าจอเป็น "โครงการ")
- เลือกช่วงเวลาเป็น **เดือน/ปี** เท่านั้น: เก็บ `startDate` = วันที่ 1 ของเดือนเริ่ม, `endDate` = วันสุดท้ายของเดือนสิ้นสุด (`monthStartIso`/`monthEndIso`)
- ฟิลด์: ชื่อ, ประเภท (`WORK_TYPES`), ผู้รับผิดชอบ, สถานะ, รายละเอียด, กิจกรรม (`activities?`)
- ฟอร์มโครงการ (`PlanFormDialog`) **ไม่จัดการกิจกรรม** และตอนบันทึกจะไม่ส่งฟิลด์ `activities` ไปด้วย (service จึงคงกิจกรรมเดิมไว้)

### กิจกรรมย่อย (Activity) และ To do
- อยู่ใน `WorkPlan.activities[]`; จัดการที่หน้ารายละเอียดโครงการเท่านั้น
- ฟิลด์: ชื่อ, ผู้รับผิดชอบ, รายละเอียด, สถานะ, **วันที่เริ่ม/สิ้นสุดแบบเต็มวัน** (ต่างจากโครงการ), หมายเหตุ, `todos[]`
- `note` = หมายเหตุกรณีเปลี่ยนสถานะ: ตอนแก้ไขแล้วเปลี่ยนสถานะ ช่องจะขึ้นกรอบเหลืองเตือนให้ระบุ (ไม่บังคับ; **ไม่มีประวัติการเปลี่ยนสถานะ**)
- `TodoItem { id, text, done }` ติ๊กได้บนการ์ดกิจกรรม ผลไม่กระทบสถานะกิจกรรมโดยอัตโนมัติ

### สถานะ (5 ค่า, `status.constant.ts`)
`planned` วางแผน · `in-progress` กำลังดำเนินการ · `completed` เสร็จสิ้น · `delayed` ล่าช้า · `cancelled` ยกเลิก
(ใช้สีเดียวกันทั้งแอป: ป้ายสถานะ, Timeline, Dashboard)

### Monthly Report (Event) — แยกจากโครงการ
- `CalendarEvent { id, startDate, endDate (yyyy-MM-dd), title, description?, priority? ('urgent'|'adhoc'|'normal'|'low'), done?, projectId?, projectName?, activityId?, activityName?, createdAt, updatedAt }`
- **ไม่มีเวลา** — Event เป็นช่วงวัน วันเริ่มต้น–วันสิ้นสุด (วันเดียวก็ได้) บังคับวันสิ้นสุด ≥ วันเริ่มต้น; Event หลายวันแสดงในทุกช่องวันที่ครอบคลุม (มีไอคอน ↔)
- ข้อมูลรุ่นแรก (`date` + `startTime`/`endTime`, priority `high`/`medium`) แปลงอัตโนมัติตอนโหลดและตอนนำเข้า: `date` → startDate = endDate, ทิ้งเวลา, high → urgent, medium → normal (`upgradeSavedEvent`, `toEventPriority`)
- เชื่อมโยงโครงการ/กิจกรรมได้ (ไม่บังคับ) และ **เก็บชื่อไว้ในตัว Event** เพื่ออ่านได้แม้โครงการถูกลบ/ย้ายเครื่อง (แสดง "ไม่พบโครงการนี้ในระบบ")
- ปฏิทินเริ่มวันอาทิตย์, ช่องวันโชว์ Event ได้ 3 รายการ ที่เหลือ "+N รายการ"
- **Priority** ด่วน/งานแทรก/ปกติ/ไม่ด่วน (`EVENT_PRIORITY_LIST` ใน status.constant.ts: แดง/ม่วง/น้ำเงิน/เขียว) — Event ที่ไม่มีค่านี้ถือเป็น "ปกติ" (`eventPriority()`)
- **ลำดับ** Event ในแต่ละวันเรียงตาม Priority (ด่วน → งานแทรก → ปกติ → ไม่ด่วน) แล้วตามวันเริ่มต้น แล้วตามชื่อ (`compareEvents`)
- **ทำแล้ว** (`done`) ติ๊กได้ในหน้าต่าง Event ประจำวันหรือในฟอร์ม → แสดงขีดฆ่าบนปฏิทิน; หัวหน้าแสดงสรุป Event เดือนนี้ / ทำแล้ว % / ยังไม่ทำแยกตาม Priority

## 5. การเก็บข้อมูลและไฟล์

| ข้อมูล | ที่เก็บ | รูปแบบ |
|---|---|---|
| โครงการ + กิจกรรม + to do | `localStorage['awp:plans:v1']` | array ของ `WorkPlan` |
| Event ปฏิทิน | `localStorage['awp:events:v1']` | array ของ `CalendarEvent` |

**JSON โครงการ** (ปุ่ม "จัดการข้อมูล" ใน Toolbar) ส่งออก array ของโครงการในปีงบที่เลือก ชื่อ `annual-work-plan-<ปีงบ>.json`
นำเข้าได้แบบ "ผสาน" (ตาม `id`) หรือ "แทนที่ทั้งหมด"; ตอนนำเข้าจะตรวจฟิลด์, เติม `id`/`done` ที่หาย, แปลง `year` เป็นปีงบ (รองรับไฟล์เก่าที่ไม่มีกิจกรรม)

**JSON Event** ห่อเป็น `{ "type": "monthly-report-events", "version": 2, "exportedAt": "...", "events": [...] }` (รับ array เปล่าๆ ก็ได้)
ตรวจว่าวันเริ่มต้น/สิ้นสุดเป็นวันที่ที่มีอยู่จริง (`isRealIsoDate`) และสิ้นสุด ≥ เริ่มต้น, ชื่อไม่ว่าง (ไฟล์ version 1 ที่มี `date` + เวลา ก็นำเข้าได้) — ผิดแล้วบอกลำดับที่ผิดและไม่แตะข้อมูลเดิม

**Excel** (`ExportImportService.exportExcel`, ExcelJS) 3 ชีต: `ปีงบ <ปี>` (โครงการ), `กิจกรรมย่อย <ปี>` (มีเมื่อมีกิจกรรม รวมคอลัมน์ To do), `Timeline <ปี>` (รูป PNG ของ Timeline วาดด้วย canvas จากข้อมูลเดียวกับหน้า Timeline — มีเส้นวันนี้และแถบผ่านมาแล้ว/ยังไม่ถึง)

## 6. โครงสร้างโค้ด

```
src/app/
  app.*                     root component, config, routes (lazy)
  core/
    models/                 work-plan.model.ts (WorkPlan/Activity/TodoItem), calendar-event.model.ts, status.constant.ts
    services/               work-plan.service.ts, event.service.ts, storage.service.ts, export-import.service.ts
  features/
    dashboard/              dashboard.ts + dashboard.util.ts (summarizeYear)
    plan-list/              plan-list.ts + plan-form-dialog/
    project-detail/         project-detail.ts + activity-form-dialog/
    timeline/               timeline.ts, timeline.util.ts (layout), timeline-image.ts (canvas → PNG)
    monthly-report/         monthly-report.ts, day-events-dialog.ts, event-form-dialog.ts, calendar.util.ts, event-file.util.ts
  shared/
    components/             toolbar, status-badge, confirm-dialog, thai-date-picker, thai-month-picker, time-field
    utils/                  date.util.ts (ISO/ปีงบ/รูปแบบไทย), activity.util.ts, id.util.ts, file.util.ts
```

ตรรกะที่คำนวณได้ถูกแยกเป็น **ฟังก์ชันบริสุทธิ์ + ไฟล์ `.spec.ts`** (`date.util`, `timeline.util`, `dashboard.util`, `calendar.util`, `event-file.util`, `activity.util`) — คอมโพเนนต์ที่มี UI ทดสอบด้วยการเปิดจริงในเบราว์เซอร์แทน

## 7. ข้อตกลงในการเขียนโค้ด

- Standalone components, `ChangeDetectionStrategy.OnPush`, state ด้วย `signal`/`computed`, ฟอร์มด้วย `[(ngModel)]` ผูกกับ signal
- วันที่เป็น **สตริง ISO `yyyy-MM-dd`** เสมอ แปลงด้วย `parseIsoDate` (ไม่ผ่าน `new Date(iso)` เพื่อเลี่ยงการเลื่อนตาม timezone); ปี พ.ศ. เป็นแค่การแสดงผล
- `todayIso()` ใช้เวลาท้องถิ่น (ไม่ใช้ `toISOString()` ที่เป็น UTC)
- ตัวเลือกวันที่/เดือน/เวลาเป็นคอมโพเนนต์ของเราเอง (`ThaiDatePicker`, `ThaiMonthPicker`, `TimeField`) เพราะ input ของเบราว์เซอร์แสดงปี ค.ศ. / AM-PM ตามเครื่อง — ค่าที่ส่งออกยังเป็น ISO / `HH:mm` 24 ชม.
- Tailwind: ใช้ชื่อ class แบบ canonical ตามที่ IDE แนะนำ (เช่น `shrink-0`, `grow`); class ที่มี `:` (เช่น `hover:`) **ห้ามใช้ใน `[class.xxx]`** ให้ใช้ `[class]="เงื่อนไข ? '...' : '...'"` แทน
- ข้อความบนหน้าจอเป็นภาษาไทย; คอมเมนต์ในโค้ดเป็นอังกฤษ

## 8. คำสั่งที่ใช้

```bash
npm ci                     # ติดตั้ง
npm start                  # ng serve → http://localhost:4200
npx ng build               # production → dist/annual-work-planning/browser
npx ng test --watch=false  # 68 tests
MSYS_NO_PATHCONV=1 npx ng build --base-href "/planner-tracking/"   # build แบบเดียวกับ GitHub Pages
```

หมายเหตุ Windows/Git Bash: ถ้าส่ง `--base-href "/..."` โดยไม่ตั้ง `MSYS_NO_PATHCONV=1` Git Bash จะแปลง path เป็น `C:/Program Files/Git/...` (เป็นแค่ปัญหาในเครื่อง ไม่เกิดบน CI)

## 9. การ deploy (GitHub Pages)

- Workflow: `.github/workflows/deploy.yml` รันเมื่อ push เข้า `main` (หรือกด Run workflow): `npm ci` → `ng test` (เทสต์ไม่ผ่านไม่ deploy) → `ng build --base-href "/<repo>/"` → คัดลอก `index.html` เป็น `404.html` (ให้ลิงก์ลึกอย่าง `/plans/xxx` เข้าแอปได้หลังรีเฟรช) → `configure-pages` → `upload-pages-artifact` → `deploy-pages`
- URL ที่ตั้งใจ: **https://meeker-moo.github.io/planner-tracking/**
- `index.html` มี `<meta name="robots" content="noindex, nofollow">` กันเสิร์ชเอนจิน
- **สถานะ ณ 2026-09-20: ยังไม่ deploy แอป** — URL แสดงหน้า README (Jekyll) เพราะ Pages ตั้ง Source เป็น "Deploy from a branch"
  ต้องไปที่ Settings → Pages → Source เลือก **GitHub Actions** แล้วกด Run workflow (ตรวจแล้วว่า CI ผ่านทุกขั้นก่อนถึง `configure-pages`)
- การเข้าถึง: GitHub Pages เปิดให้ทุกคนที่มี URL ไม่มีระบบล็อกอินแบบ "เฉพาะผู้มีลิงก์" (จำกัดเฉพาะองค์กรต้อง Enterprise Cloud); repo เป็น public จึงเห็นซอร์สได้; ข้อมูลในแอปอยู่ในเบราว์เซอร์ของแต่ละคน เว็บที่ publish จึงไม่มีข้อมูลโครงการ

## 10. สิ่งที่ควรรู้ / ข้อควรระวัง

- **ส่งออกตามปีงบที่ "เริ่ม"**: ปุ่มส่งออก JSON/Excel ส่งเฉพาะโครงการที่ `year` = ปีงบที่เลือก ขณะที่ Timeline แสดงโครงการที่ "คาบเกี่ยว" ปีงบนั้น ทำให้บนจออาจมีโครงการมากกว่าในไฟล์/รูป Excel
- **รูป Timeline ใน Excel เป็นภาพนิ่ง** ณ วันที่ส่งออก แก้ไขใน Excel ไม่ได้
- **"วันนี้" อ่านตอนเปิดหน้า** เปิดค้างข้ามคืนต้องรีเฟรชเส้น/ไฮไลต์เดือนจึงขยับ
- ข้อมูลอยู่ใน localStorage ต่อ origin: ล้างข้อมูลเบราว์เซอร์ = ข้อมูลหาย → ควรส่งออก JSON สำรองเป็นระยะ; ผู้ใช้หลายเครื่อง/หลายเบราว์เซอร์ไม่ซิงก์กัน
- ไม่มีประวัติการเปลี่ยนสถานะของกิจกรรม (มีแค่ช่องหมายเหตุ)
- `exceljs` เป็น CommonJS → ตั้ง `allowedCommonJsDependencies: ["exceljs"]` ใน `angular.json` เพื่อปิดคำเตือน build
- `public/data/` อยู่ใน `.gitignore` (เป็นข้อมูลทดสอบเก่า แอปไม่อ่านแล้ว); ถ้ามีไฟล์อยู่ในเครื่อง Angular จะคัดลอกไป `dist/data` ตอน build ในเครื่อง (ไม่กระทบ CI เพราะไม่ได้อยู่ใน repo)

## 11. ประเด็นที่ยังเปิดอยู่ / ต่อยอดได้

- เปิด GitHub Pages แบบ GitHub Actions ให้เสร็จ แล้วตรวจว่าเข้าแอปได้ (รวมลิงก์ลึก)
- ถ้าต้องการ **ล็อกอินจริง** (จำกัดผู้เข้าถึง) ต้องย้ายไปบริการอื่น เช่น Cloudflare Pages + Access หรือ Netlify แบบมีรหัสผ่าน
- ให้ส่งออก Excel/JSON รวมโครงการที่คาบเกี่ยวปีงบที่เลือก (ให้ตรงกับ Timeline)
- ประวัติการเปลี่ยนสถานะกิจกรรม (จาก→เป็น, เมื่อไร, หมายเหตุ)
- ช่องเลือกนาทีของ `TimeField` เป็นทุกนาที (00–59) — ปรับเป็นทีละ 5/15 นาทีได้ถ้าต้องการเลือกเร็วขึ้น
- ให้ Event ใน Monthly Report คร่อมหลายวัน, กรองตาม Priority/สถานะ

## 12. วิธีตรวจงานที่ใช้ในโปรเจกต์นี้

นอกจาก `ng build` / `ng test` การตรวจหน้าจอทำโดยรัน Edge แบบ headless ควบคุมผ่าน Chrome DevTools Protocol (Node `WebSocket`)
กับ static server ชั่วคราวที่ใส่ข้อมูลตัวอย่างลง `localStorage` ก่อนโหลด แล้วคลิก/กรอก/แคปภาพ และอ่านค่าจาก `localStorage` เพื่อยืนยันผล
(ต้องใช้ `--user-data-dir` แยกเพื่อไม่ชนกับ Edge ที่เปิดอยู่ และหยุดกระบวนการหลังใช้เสร็จ)
