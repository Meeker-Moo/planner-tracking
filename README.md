# AnnualWorkPlanning

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.2.

## Publishing (Cloudflare)

The app and its API run on Cloudflare's free plan as one Worker
([wrangler.jsonc](wrangler.jsonc)) at **https://planner.planner-moph.workers.dev**: the Worker serves the built
Angular files, and its code in [server/](server/) answers `/api/*` with the data in a D1 (SQLite) database,
`moph-planner-db`.

Every push to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml): it installs, runs both test
suites (a failing test stops the deploy), builds, applies new database migrations
([migrations/](migrations/)) and deploys the Worker. It needs two repository secrets (**Settings → Secrets and
variables → Actions**): `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers" plus D1 Edit) and
`CLOUDFLARE_ACCOUNT_ID`.

To deploy by hand instead: `npx wrangler login`, `npm run db:migrate:remote`, `npx ng build`, `npx wrangler deploy`.
`npx wrangler tail` shows the live requests and errors, including how much CPU time a sign-in takes (the free plan
allows 10 ms per request; if sign-ins fail with "exceeded CPU", lower `PASSWORD_ITERATIONS` in wrangler.jsonc).

### The first Super Admin

The database starts empty. After the first deploy, create the first account from your own machine (signed in with
`npx wrangler login`); it asks for the password without showing it and stores only its hash:

```bash
npm run create-super-admin -- --remote <username> "<display name>"
```

Then sign in at the address above and create the other accounts on the user management page. The same command
adds another Super Admin if every one is locked out.

### Backups

D1's Time Travel can put the database back to any minute of the last 7 days on the free plan:
`npx wrangler d1 time-travel restore moph-planner-db --timestamp=<ISO time>`. For a copy of your own, run
`npx wrangler d1 export moph-planner-db --remote --output=backup.sql` now and then (keep it out of the repository).

## Login and roles

The first page, Excel Compare (`/excel`), is a separate tool open to everyone; it has its own button beside the
account menu rather than a place in the project menu. Every other page needs a login, and the project menu
stays hidden until you sign in. There are three roles:

| Role | Pages | What it can do |
| --- | --- | --- |
| **Super Admin** | User management only | Create, edit, deactivate and reset the password of any other account, Admins included |
| **Admin** | Every page, plus user management | Manage **User** accounts only; see, edit and delete everyone's projects and events (the toolbar's "ข้อมูลของ" picks whose) |
| **User** | Dashboard, projects, Timeline | Create projects and edit their own in full; work on the projects assigned to them (status and activities); set the status of activities assigned to them |

- The Dashboard shows every project to Admin and User alike (no "ข้อมูลของ" filter there). The project list,
  project pages and Timeline show a User only their own projects and the ones they take part in.

- "ผู้รับผิดชอบ" of a project and of each activity is an Admin or User account picked from a list; a new project or
  activity starts with whoever adds it. Projects saved before accounts existed keep their typed-in name until
  someone picks an account.
- Only the project's owner and Admin edit the project itself (its details, who is responsible) or delete it.
  The account a project is assigned to (its "ผู้รับผิดชอบ") may change the project's status and add, edit and
  remove its activities and to-dos, but not delete the project. The account responsible for one activity may
  change only that activity's status, note and to-do ticks. Where only the status may change, the edit button
  reads "เปลี่ยนสถานะ" and opens a form with just that.
- Monthly Report (events) is for Admin. An event can be assigned to User accounts ("ผู้ได้รับมอบหมาย" in its form).
- A new account, and one whose password is reset, gets a one-time password shown once on the user management page.
  The account must pick its own password at its next sign-in. Anyone can change their password from the account menu.
- Five wrong passwords in a row lock the account for 15 minutes. Deactivating an account or resetting its password
  signs it out at once. Accounts are never deleted, only deactivated, so their projects keep an owner.
- Data is not imported or exported as JSON any more (it lives in the database). The project list and
  Timeline keep "ส่งออก Excel", which saves the projects shown (with their activities and a picture of the
  Timeline) as an .xlsx file.

A login lasts until the browser is closed (12 hours at most), or 30 days on that browser when
"จดจำการเข้าสู่ระบบ" is ticked. The session is an HttpOnly cookie; the server keeps only a hash of it.

Every rule is checked by the server ([server/](server/), using the same
[permissions.ts](src/app/core/auth/permissions.ts) as the pages), so a page that was tampered with gets nothing more.

## Development server

The app needs its API. Once, set up a local database with the develop accounts (it lives in `.wrangler/`):

```bash
npm run db:migrate:local
npm run db:seed:local
```

Then run the API and the app, each in its own terminal:

```bash
npm run api     # the Worker and the local D1 on http://localhost:8787
npm start       # ng serve on http://localhost:4200, which passes /api to the Worker (proxy.conf.json)
```

Open `http://localhost:4200/`. The develop accounts are `superadmin` / `super1234`, `admin` / `admin1234`, and
`user1` and `user2` / `user1234`; the login page lists them, click one to fill the form. Both servers reload when
their source files change. A new file in [migrations/](migrations/) is applied with `npm run db:migrate:local`
(and by the deploy, remotely).

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

The server's rules have their own tests (and a type check), run with `npm run test:server`.

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
