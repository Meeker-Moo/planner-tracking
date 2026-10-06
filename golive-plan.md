# ย้าย Annual Work Planning ไป Cloudflare (ฟรี) + D1 + ระบบผู้ใช้หลายคน

## Context
ตอนนี้แอปเป็น Angular SPA บน GitHub Pages ข้อมูลทั้งหมดอยู่ใน `localStorage` ([storage.service.ts](src/app/core/services/storage.service.ts)) และ login เป็นแค่การตรวจ hash ของบัญชีเดียวในเบราว์เซอร์ ([auth.config.ts](src/app/core/auth/auth.config.ts))

เป้าหมาย:
- ย้ายทั้งหมดไป Cloudflare แบบฟรี โดยให้ **Worker ตัวเดียว** เสิร์ฟทั้งไฟล์ Angular (Static Assets) และ API `/api/*` บนโดเมนเดียวกัน
- ใช้ **D1** (SQLite) เก็บข้อมูล
- ทำ **ระบบผู้ใช้จริง** 3 role และให้แต่ละคนมีข้อมูลของตัวเอง

ข้อตกลงที่ได้จากผู้ใช้:
- **SUPER_ADMIN** ทำได้ทุกอย่าง รวมถึงสร้าง แก้ไข และปิดใช้งาน Admin และใช้ได้แค่ระบบจัดการผู้ใช้งานเท่านั้น (เข้าหน้าโครงการ/Timeline/Monthly Report/Dashboard ไม่ได้)
- **ADMIN** สร้าง แก้ไข ปิดใช้งาน และ reset รหัสได้เฉพาะบัญชี role USER และเห็นข้อมูลของทุกคน
- **USER** ใช้ได้แค่ Dashboard, รายการโครงการ และ Timeline (ไม่มี Monthly Report และหน้าจัดการผู้ใช้)
  - สร้างโครงการได้ และแก้โครงการที่ตัวเองสร้างได้เต็มที่
  - รายการโครงการ/Timeline เห็นของตัวเอง และโครงการที่ตัวเองรับผิดชอบหรือรับผิดชอบกิจกรรมในโครงการ (เห็นทุกกิจกรรมของโครงการนั้น)
  - ผู้ได้รับมอบหมายโครงการ (ผู้รับผิดชอบโครงการ) เปลี่ยนสถานะโครงการ และเพิ่ม/แก้ไข/ลบกิจกรรมและ to do ได้ แต่แก้รายละเอียดโครงการหรือลบโครงการไม่ได้ ส่วนผู้รับผิดชอบกิจกรรมเปลี่ยนได้แค่สถานะ หมายเหตุ และติ๊ก to do ของกิจกรรมนั้น
- **Dashboard** เห็นภาพรวมทุกโครงการเหมือนกันทั้ง ADMIN และ USER (Super Admin ไม่มี Dashboard)
- **โครงการ:** "ผู้รับผิดชอบ" ของโครงการและกิจกรรมย่อยเลือกจากบัญชี ADMIN/USER (`responsibleId`) ค่าเริ่มต้นเป็นคนที่ login
- **Event:** ใช้เฉพาะ ADMIN มอบหมายด้วย `assigneeIds` ได้
- รหัสผ่านใช้แบบ Admin ตั้งรหัสชั่วคราวให้ แล้วบังคับเปลี่ยนตอน login ครั้งแรก ไม่มีระบบส่งอีเมล
- **เลิกใช้ localStorage** สำหรับข้อมูล และไม่ migrate ข้อมูลเดิม (เริ่มจากฐานข้อมูลว่าง) ไม่มีการนำเข้า/ส่งออก JSON แล้ว (ข้อมูลมาจากฐานข้อมูล) เหลือแค่ส่งออก Excel ที่ทำฝั่ง client จากข้อมูลที่โหลดมา

## สถานะ: ระบบผู้ใช้ทำแล้วแบบไม่มี Database
ระบบ 3 role ทำงานแล้วฝั่ง client โดยเก็บใน localStorage (ดู README หัวข้อ Login and roles) งานที่เหลือในแผนนี้คือย้ายที่เก็บไป Worker + D1:
- กฎสิทธิ์อยู่ใน [permissions.ts](src/app/core/auth/permissions.ts) เป็น pure function ให้ย้ายไปใช้ฝั่ง server ได้ตรง ๆ (`canManageUser`, `assignableRoles`, `canViewPlan/canEditPlan/canManageActivities/canSetPlanStatus/canSetActivityStatus` ของโครงการ และ `canView/canEdit/canDelete/canReassign` ของ event)
- [user-store.service.ts](src/app/core/auth/user-store.service.ts) มี method async ตรงกับ endpoint `/api/users` และ `/api/auth/*` ด้านล่าง ให้เปลี่ยนไส้ในเป็นเรียก API แทน localStorage
- hash รหัสผ่านใช้รูปแบบ `pbkdf2$<iter>$<salt>$<hash>` แล้ว ([password.util.ts](src/app/core/auth/password.util.ts)) ส่วน `sessionVersion` ใช้แทนการลบ session ฝั่ง client
- ย้ายไป Cloudflare ทั้งหมด และทำ repo เป็น private ได้หลังย้ายเสร็จ
- *ข้อสันนิษฐาน:* Admin ขึ้นไป **แก้ไขและลบ**ข้อมูลของทุกคนได้ด้วย ไม่ใช่แค่ดู

โควตาฟรีที่เกี่ยวข้อง: Workers 100k request/วัน (การโหลดไฟล์ static ไม่นับและไม่จำกัด), D1 เก็บได้ 5 GB, อ่าน 5M แถว/วัน, เขียน 100k แถว/วัน

## สิ่งที่ผู้ใช้ต้องทำเอง (ครั้งเดียว)
1. ✅ สมัคร Cloudflare (ฟรี) แล้วรัน `npx wrangler login`
2. ✅ ตั้งชื่อ subdomain ของบัญชี workers.dev และสร้างฐานข้อมูล D1 (`--location apac`)
   - subdomain: `planner-moph` เว็บจะอยู่ที่ `https://planner.planner-moph.workers.dev`
   - `database_name`: `moph-planner-db`
   - `database_id`: `2cb9de1c-ef49-4e54-a4df-ad36200290a2`
3. (รอโค้ด) `npm run db:migrate:remote` แล้วสร้าง Super Admin คนแรกด้วย `npm run create-super-admin -- --remote <username> <displayName>` ซึ่งจะถามรหัสผ่าน แล้วรัน `wrangler d1 execute` เพื่อ INSERT
   - ถ้าไม่ใส่ `--remote` จะสร้างใน D1 local (ตอน dev ใช้ `npm run db:seed:local` แทนได้)
4. ✅ เพิ่ม secret ใน GitHub repo: `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers" เพิ่มสิทธิ์ D1 Edit) และ `CLOUDFLARE_ACCOUNT_ID`
5. (รอโค้ด) หลังเว็บใหม่ใช้งานได้ ให้ปิด GitHub Pages แล้วเปลี่ยน repo เป็น private ได้ (Settings → General → Change visibility)
   - ห้ามเปลี่ยนก่อนย้ายเสร็จ เพราะ GitHub Pages บน private repo ต้องใช้ GitHub Pro
   - Actions ของ private repo ฟรี 2,000 นาทีต่อเดือน

## ความคืบหน้า
- ✅ **หัวข้อ 1–2 (Database + Worker)** ทำแล้ว: `wrangler.jsonc`, `migrations/0001_init.sql`, `server/`, `server/seed-dev.sql`, `scripts/create-super-admin.mjs`, script ใน `package.json` และ `npm run test:server`
  - ทดสอบกับ D1 local ผ่าน `wrangler dev` แล้ว (สิทธิ์ 3 role, บังคับเปลี่ยนรหัส, 409 เมื่อแก้ทับกัน, ล็อกบัญชี, ปิดใช้งานแล้ว session หลุด, SPA fallback)
  - ต่างจากแผนเล็กน้อย: `GET /api/plans` ไม่มี `?owner=` (ตัวกรองเจ้าของยังทำฝั่ง client เหมือนเดิม) มีแค่ `?year=`, ส่วน `GET /api/plans/summary` รับ `?today=` ด้วย และ `GET /api/events` ให้ USER เห็น event ที่ตัวเองสร้างหรือได้รับมอบหมาย (ตาม `canView`) แต่สร้าง event ได้เฉพาะ ADMIN
  - ยังไม่ได้ตรวจ CPU time ของ login บน Cloudflare จริง (local ไม่จำกัด CPU) ให้ดูด้วย `wrangler tail` ตอน deploy ครั้งแรก
  - `GET /api/auth/me` ตอบ `{ user: null }` (200) เมื่อยังไม่ login แทน 401 เพราะแอปเรียกทุกครั้งที่เปิด
- ✅ **หัวข้อ 3 Frontend** ทำแล้ว: ลบ `storage.service.ts`, เพิ่ม `api.service.ts`, `session-loader.ts` (โหลด/ล้างข้อมูลเองเมื่อ login/logout), `record-sync.ts` (ส่งการแก้ไขทีละ request ต่อรายการ จึงติ๊ก to do รัว ๆ ได้โดยไม่ชน 409) และ `session-data.service.ts`
  - Dashboard ใช้ `GET /api/plans/summary` แทน `allPlans`, หน้า login แสดงบัญชีทดสอบจาก `DEV_ACCOUNTS` เฉพาะตอน `ng serve`
  - dev: `proxy.conf.json` ส่ง `/api` ไป `wrangler dev`, `npm run api` สร้างโฟลเดอร์ `dist/` ให้เองเพราะ wrangler ไม่ยอมเริ่มถ้าไม่มี
  - ทดสอบในเบราว์เซอร์จริง (Chrome headless) กับ Worker + D1 local แล้ว: admin สร้างโครงการ, reload และเปิด `/plans/<id>` ตรง ๆ ยังอยู่, user1 เห็น Dashboard แต่ไม่เห็นโครงการของ admin ในรายการ, ไม่มี error ใน console
- ✅ **หัวข้อ 4 Deploy** ทำแล้ว: `deploy.yml` รัน test ทั้งสองชุด → build → migrate D1 → `wrangler deploy` และอัปเดต README
- ✅ **หัวข้อ 6 Tests** ทำแล้ว: spec ฝั่ง client ใช้ `FakeApi` ใน `auth.testing.ts` (backend ในหน่วยความจำ) แทน localStorage
- ⏳ เหลือ: push ไป `main` ครั้งแรก → สร้าง Super Admin → ตรวจ `wrangler tail`
- ⏸ ปิด GitHub Pages และเปลี่ยน repo เป็น private: ผู้ใช้เข้าไปทำเองในหน้าเว็บ GitHub หลังเว็บใหม่ใช้งานได้ (ไม่ตั้งเวลาอัตโนมัติ เพราะต้องใช้ token สิทธิ์ admin)
- ⏳ เลื่อนไปหลัง go-live: Cron backup ไป R2

## ปรับจากที่อ่านโค้ด
- **รายชื่อบัญชีสำหรับ USER:** responsible-picker, owner-tag และฟอร์มโครงการ/กิจกรรมต้องใช้ชื่อบัญชี แต่ USER เรียก `/api/users` แล้วได้ 403 จึงเพิ่ม `GET /api/users/directory` ที่คืน `id, displayName, role, active` ของบัญชี ADMIN/USER ให้ทุกคนที่ login
- **Session:** ใช้ตาราง `sessions` ฝั่ง server แทน `sessionVersion` แล้วตัด `sessionVersion` ออกจาก `AppUser` ฝั่ง client
- **Dashboard:** `GET /api/plans/summary?year=` เรียก `summarizeYear()` จาก [dashboard.util.ts](src/app/features/dashboard/dashboard.util.ts) ฝั่ง server และคืน `years` ด้วย ใช้แทน `allPlans` / `allYears` ของ WorkPlanService
- **ใช้โค้ดร่วมกัน:** Worker import โค้ด pure จาก `src/` ตรง ๆ (`permissions.ts`, `password.util.ts`, `owned-records.ts`, `summarizeYear`, `withFiscalYear`, `upgradeSavedEvent`) แทนการเขียนซ้ำ ไฟล์ที่ import ต้องไม่พึ่ง `@angular/*`
- **รอบ PBKDF2:** อ่านจาก env `PASSWORD_ITERATIONS` จะได้ลดรอบได้โดยไม่ต้องแก้โค้ดถ้าเกิน CPU 10ms
- **บัญชี dev:** seed ผ่าน `server/seed-dev.sql` ที่ใช้ hash `sha256$` เดิมของ `DEVELOP_SEED_USERS` (verifyPassword รองรับและจะ rehash ให้เอง) รันด้วย `npm run db:seed:local`
- **Backup ไป R2** (หัวข้อ 5) เลื่อนไปทำหลัง go-live

## 1. Database: `migrations/0001_init.sql`
```sql
users(id TEXT PK, username TEXT UNIQUE COLLATE NOCASE, display_name TEXT,
      role TEXT CHECK(role IN ('SUPER_ADMIN','ADMIN','USER')),
      password_hash TEXT,            -- "pbkdf2$<iter>$<salt b64>$<hash b64>"
      must_change_password INT, active INT, failed_logins INT, locked_until TEXT,
      created_by TEXT, created_at TEXT, updated_at TEXT)
sessions(token_hash TEXT PK, user_id TEXT REFERENCES users ON DELETE CASCADE,
         expires_at TEXT, created_at TEXT)
plans(id TEXT PK, owner_id TEXT REFERENCES users, year INT, data TEXT /*WorkPlan JSON*/, updated_at TEXT)
events(id TEXT PK, owner_id TEXT REFERENCES users, data TEXT /*CalendarEvent JSON*/, updated_at TEXT)
-- plans เพิ่มคอลัมน์ responsible_id TEXT REFERENCES users
plan_members(plan_id TEXT REFERENCES plans ON DELETE CASCADE, user_id TEXT REFERENCES users,
             PRIMARY KEY (plan_id, user_id))   -- ผู้รับผิดชอบโครงการ + ผู้รับผิดชอบกิจกรรม เขียนใหม่ทุกครั้งที่ save
event_assignees(event_id TEXT REFERENCES events ON DELETE CASCADE, user_id TEXT REFERENCES users,
                PRIMARY KEY (event_id, user_id))
-- index: plans(owner_id, year), events(owner_id), sessions(user_id), plan_members(user_id), event_assignees(user_id)
```
- เก็บ 1 รายการต่อ 1 แถว ส่วนข้อมูลที่ซ้อนกัน (activities/todos) เก็บเป็น JSON ทำให้ model ใน [work-plan.model.ts](src/app/core/models/work-plan.model.ts) และ [calendar-event.model.ts](src/app/core/models/calendar-event.model.ts) ไม่ต้องแก้
- ฝั่ง client มี `ownerId`, `responsibleId` (โครงการและกิจกรรม) และ `assigneeIds` (event) อยู่แล้ว API ใส่ `ownerName` (optional) เพิ่มให้ และเติมชื่อ `responsible` จากบัญชีปัจจุบันเหมือนที่ WorkPlanService ทำ
- ผู้มีส่วนร่วมแยกเป็นตาราง `plan_members` / `event_assignees` เพื่อให้ query "ของฉันหรือที่รับผิดชอบ/ได้รับมอบหมาย" ใช้ index ได้ แทนการค้นใน JSON

## 2. Backend: Worker (`server/`)
- `wrangler.jsonc`: `name: "planner"` (ได้ URL `https://planner.planner-moph.workers.dev` และเพิ่มโดเมนของตัวเองทีหลังได้ผ่าน `routes`), `main: server/index.ts`, `assets: { directory: dist/annual-work-planning/browser, not_found_handling: "single-page-application", run_worker_first: ["/api/*"] }`, `d1_databases: [{ binding: "DB", database_name: "moph-planner-db", database_id: "2cb9de1c-ef49-4e54-a4df-ad36200290a2", migrations_dir: "migrations" }]`, `vars: { PASSWORD_ITERATIONS: "100000" }`
  - การตั้ง `single-page-application` ทำให้ไม่ต้องใช้ทริก copy `404.html` อีก
- `server/index.ts` เป็น router เล็ก ๆ ที่ไม่พึ่ง framework แยกโค้ดเป็น `auth.ts`, `users.ts`, `plans.ts`, `events.ts`, `password.ts`
- **รหัสผ่าน:** ใช้ PBKDF2-SHA256 ผ่าน WebCrypto และเก็บจำนวนรอบไว้ใน hash ด้วย
  - Workers จำกัด PBKDF2 ไว้ที่ไม่เกิน 100k รอบ และแผนฟรีให้ CPU 10ms ต่อ request
  - เริ่มที่ 100k รอบ แล้วตรวจด้วย `wrangler tail` ถ้าเจอ CPU exceeded ให้ลดรอบลง
  - hash ที่เก็บไว้แล้วยังใช้ได้ และระบบจะ rehash เองตอน login ครั้งถัดไป
- **Session:**
  - สร้าง token สุ่ม 32 byte ใส่ใน cookie `awp_session` (HttpOnly, Secure, SameSite=Strict) และเก็บเฉพาะ SHA-256 ของ token ไว้ในตาราง `sessions`
  - ถ้าติ๊ก "จดจำ" ให้อยู่ได้ 30 วัน ถ้าไม่ติ๊กให้อยู่ได้ 12 ชั่วโมงเป็น session cookie
  - ปิดใช้งานผู้ใช้หรือ reset รหัสแล้วให้ลบ session ทั้งหมดของคนนั้นทันที
- **กันเดารหัส:** ผิด 5 ครั้งให้ล็อก 15 นาที (`failed_logins`, `locked_until`)
- **Endpoints:**
  - `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
  - `POST /api/auth/change-password` (ต้องใส่รหัสเดิม และเมื่อสำเร็จจะเคลียร์ `must_change_password`)
  - ถ้ายังต้องเปลี่ยนรหัส (`must_change_password`) ทุก endpoint ยกเว้น me/logout/change-password จะตอบ 403 `PASSWORD_CHANGE_REQUIRED`
  - `GET|POST /api/users`, `PATCH /api/users/:id` (แก้ชื่อ, role, active), `POST /api/users/:id/reset-password`
    - ใช้ `canManage(actor, target)`: SUPER_ADMIN จัดการได้ทุกบัญชียกเว้นลด role หรือปิดใช้งาน Super Admin คนสุดท้าย ADMIN จัดการได้เฉพาะบัญชี USER (สร้างได้เฉพาะ role USER) ส่วน USER ได้ 403
    - ไม่มีการลบผู้ใช้จริง มีแค่ปิดใช้งาน (`active=0`) เพื่อให้ข้อมูลที่ผูกกับเจ้าของยังอยู่ครบ
  - `GET /api/plans?owner=<id|all>`: USER ได้เฉพาะของตัวเองและที่รับผิดชอบ (`owner_id = ? OR id IN (SELECT plan_id FROM plan_members WHERE user_id = ?)`) ส่วน ADMIN ใช้ค่าเริ่มต้นเป็น `all` และ SUPER_ADMIN ได้ 403
  - `GET /api/plans/summary?year=`: ภาพรวมทุกโครงการสำหรับ Dashboard (ADMIN และ USER) ส่งเฉพาะตัวเลขสรุป ไม่ต้องส่งข้อมูลโครงการของคนอื่นทั้งก้อน
  - `POST /api/plans` (owner = คนที่สร้าง), `PUT /api/plans/:id` (เจ้าของหรือ ADMIN แก้ได้ทั้งหมด ผู้รับผิดชอบโครงการเปลี่ยนสถานะและกิจกรรมได้ตาม `canManageActivities` ผู้รับผิดชอบกิจกรรมเปลี่ยนได้เฉพาะสถานะตาม `canSetActivityStatus` ส่วนอื่นที่ส่งมาให้ตัดทิ้ง), `DELETE /api/plans/:id` (เจ้าของหรือ ADMIN)
  - `/api/events` ใช้รูปแบบเดียวกัน
- dev: seed บัญชี dev ด้วย `npm run db:seed:local` (`server/seed-dev.sql`) แล้ว login จริงแม้ใน dev เพื่อจะทดสอบสิทธิ์ของแต่ละ role ได้
- `tsconfig.server.json` ใช้ `@cloudflare/workers-types` โดยไม่ยุ่งกับ `tsconfig.worker.json` เพราะไฟล์นั้นเป็นของ excel web worker
- devDependencies: `wrangler`, `@cloudflare/workers-types`
- script: `api` (wrangler dev), `db:migrate:local`, `db:migrate:remote`, `db:seed:local`, `create-super-admin`

## 3. Frontend
- **ลบ** [storage.service.ts](src/app/core/services/storage.service.ts) และเพิ่ม `core/services/api.service.ts` (wrapper ของ `fetch` ที่จัดการ 401 โดยพาไปหน้า /login และจัดการ 403 `PASSWORD_CHANGE_REQUIRED` โดยพาไป /change-password)
- **[work-plan.service.ts](src/app/core/services/work-plan.service.ts)** และ **[event.service.ts](src/app/core/services/event.service.ts)**
  - method สาธารณะยัง synchronous เหมือนเดิม (อัปเดต signal ทันทีแบบ optimistic แล้วค่อยยิง API ตามหลัง ถ้าไม่สำเร็จให้แจ้ง error แล้ว reload) จึงไม่ต้องแก้ call site ใน plan-list, timeline, project-detail, monthly-report และ dashboard
  - เพิ่ม `load()`, `clear()` (เรียกตอน logout) และ signal `ownerFilter`
  - ใช้ `withFiscalYear` และ `upgradeSavedEvent` เดิมกับข้อมูลที่โหลดมา
- **[auth.service.ts](src/app/core/auth/auth.service.ts)**
  - `user` เป็น signal ของ `{id, username, displayName, role, mustChangePassword}`
  - `restore()` เรียก `/api/auth/me`, ส่วน `login()` และ `logout()` เรียก API
  - เพิ่ม `changePassword()`, `hasRole()`
  - ลบ `credentialHash` ออก แต่ยังใช้ `safeReturnUrl` เหมือนเดิม
- **[auth.config.ts](src/app/core/auth/auth.config.ts)**: เหลือแค่ `REMEMBER_DAYS` และตัด `AUTH_USER`, `BYPASS_LOGIN` ออก
- **[auth.guard.ts](src/app/core/auth/auth.guard.ts)**: เพิ่ม `roleGuard(...roles)` และ `passwordChangedGuard`
- **[app.config.ts](src/app/app.config.ts)**: `provideAppInitializer` เรียก `auth.restore()` และถ้า login อยู่แล้วให้โหลด plans และ events ด้วย (หลัง login ก็ให้โหลดเช่นกัน)
- **หน้าใหม่**
  - `features/users/users.ts`: ตารางผู้ใช้ ปุ่มเพิ่ม/แก้ไข ปุ่มปิดใช้งาน และปุ่ม reset รหัส (สร้างรหัสชั่วคราวแล้วแสดงครั้งเดียว) ถ้าเป็น ADMIN จะเห็นตัวเลือก role แค่ USER ทำตาม pattern dialog ที่มีอยู่ เช่น `confirm-dialog`
  - `features/change-password/change-password.ts`: ใช้ทั้งตอนบังคับเปลี่ยนรหัสและตอนเปลี่ยนรหัสเองจากเมนู toolbar
- **[app.routes.ts](src/app/app.routes.ts)**: เพิ่ม `users` (roleGuard ADMIN/SUPER_ADMIN) และ `change-password`
- **[toolbar.ts](src/app/shared/components/toolbar/toolbar.ts)**
  - เพิ่มเมนู "จัดการผู้ใช้" ที่แสดงเฉพาะ ADMIN+ และเมนู "เปลี่ยนรหัสผ่าน"
  - แสดง role badge ข้างชื่อ
- **ตัวกรองเจ้าของ (ADMIN+):** เพิ่ม dropdown "ทุกคน / เลือกผู้ใช้" ใน plan-list, timeline, dashboard และ monthly-report แล้วแสดงชื่อเจ้าของในรายการเมื่อดูแบบทุกคน
- **[login.ts](src/app/features/login/login.ts)**: แสดง error ที่มาจาก API (รหัสผิด, บัญชีถูกล็อก, บัญชีถูกปิดใช้งาน)
- dev: `proxy.conf.json` (`/api` → `http://localhost:8787`) ผูกเข้ากับ `ng serve`

## 4. Deploy
- แก้ [.github/workflows/deploy.yml](.github/workflows/deploy.yml) ให้รัน `npm ci` → `ng test` → `ng build` (ไม่ต้องใส่ `--base-href`) → `wrangler d1 migrations apply moph-planner-db --remote` → `wrangler deploy` ผ่าน `cloudflare/wrangler-action`
- ตัด step ที่เกี่ยวกับ Pages ออก
- อัปเดต README: วิธี setup, การสร้าง Super Admin, สิทธิ์ของแต่ละ role

## 5. รับมือข้อจำกัดของ Cloudflare/D1 แผนฟรี
- **แก้พร้อมกันทับกัน:** `PUT` ต้องส่ง `updatedAt` เดิมมาด้วย ถ้าในฐานข้อมูลใหม่กว่าให้ตอบ 409 แล้ว client แจ้ง "มีคนแก้ไขก่อนหน้า" และ reload เรื่องนี้สำคัญเพราะ activities/todos อยู่ใน JSON ก้อนเดียวกัน
- **โควตาอ่าน (นับแถวที่ scan ไม่ใช่แถวที่ได้กลับ):** ทุก query ต้องใช้ index (`owner_id`, `year`) ส่วน ADMIN+ ให้โหลดเฉพาะปีที่เลือก หรือช่วงปีตาม `ListSpan` แทนการโหลดทั้งหมด
- **Backup:** Time Travel ของแผนฟรีย้อนได้ 7 วัน เพิ่ม Cron Trigger รายสัปดาห์ให้ export ข้อมูลเป็น JSON ไปเก็บใน R2 (ฟรี 10 GB) และเขียนวิธี `wrangler d1 export` ไว้ใน README
- **ตำแหน่งข้อมูล:** ตอนสร้างฐานข้อมูลให้ใส่ `--location apac`
- **PBKDF2 กับ CPU 10ms:** รายละเอียดอยู่ในหัวข้อ 2

## 6. Tests
- ปรับ spec ของ work-plan/event/auth service ให้ mock `ApiService` แทนการใช้ localStorage
- เพิ่ม spec ของ role guard
- เพิ่ม unit test ฝั่ง server สำหรับ `canManage()` และ helper ที่กรองข้อมูลตามเจ้าของ (เป็น pure function รันด้วย vitest ได้)

## Verification
1. `npm run db:migrate:local` → `npm run create-super-admin` (local) → `npm run api` และ `npm start`
2. Super Admin สร้าง Admin A และ USER U1 ส่วน Admin A สร้าง U2 และต้องสร้าง Admin หรือแก้บัญชี Admin ไม่ได้ (ได้ 403)
3. U1 login แล้วต้องถูกบังคับเปลี่ยนรหัส จากนั้นสร้างโครงการและ event ส่วน U2 ต้องไม่เห็นของ U1 และเมื่อลอง `PUT /api/plans/<id ของ U1>` ด้วย cookie ของ U2 ต้องได้ 403
4. Admin A ต้องเห็นของ U1 และ U2 ผ่านตัวกรองเจ้าของได้
5. ปิดใช้งาน U1 แล้ว session ของ U1 ต้องหลุดทันที ลองใส่รหัสผิด 5 ครั้งบัญชีต้องถูกล็อก
6. ส่งออก Excel จากรายการโครงการและ Timeline ต้องได้ไฟล์ .xlsx ของโครงการที่แสดงอยู่
7. `curl https://planner.planner-moph.workers.dev/api/plans` โดยไม่มี cookie ต้องได้ 401 และใช้ `wrangler tail` ดู CPU time ของ login
8. `npx ng test --watch=false` ต้องผ่าน จากนั้น push ไป main ตรวจว่า deploy สำเร็จ และรีโหลด `/plans/<id>` ตรง ๆ ต้องได้หน้าแอป
