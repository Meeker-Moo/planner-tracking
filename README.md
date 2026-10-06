# AnnualWorkPlanning

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.2.

## Publishing (GitHub Pages)

Every push to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml): it installs, runs the tests
(a failing test stops the deploy), builds for the sub-path and publishes to
**https://meeker-moo.github.io/planner-tracking/**.

One-time setup on GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Then run the workflow
once (**Actions → Deploy to GitHub Pages → Run workflow**), or just push again.

Who can open it: a GitHub Pages site is reachable by anyone who has the address; GitHub offers no "anyone with the
link" sign-in for it (organization-only access needs GitHub Enterprise Cloud). The page tells search engines not to
index it (`noindex`), so it does not show up in results, but the link can be forwarded to anyone. The app keeps its
data only in each visitor's own browser, so the published site holds no project data.

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
- Data is not imported or exported as JSON any more (it will come from the database). The project list and
  Timeline keep "ส่งออก Excel", which saves the projects shown (with their activities and a picture of the
  Timeline) as an .xlsx file.

A login lasts until the tab is closed, or 30 days on that browser when "จดจำการเข้าสู่ระบบ" is ticked.

### Accounts on first use

Until the app has a database ([golive-plan.md](golive-plan.md)), the accounts live in each browser's localStorage
(`awp:users:v1`), next to the projects and events. A browser with no accounts yet creates them from
[src/app/core/auth/auth.config.ts](src/app/core/auth/auth.config.ts):

- **Production** (`ng build`, GitHub Pages): `superadmin` with the temporary password `ChangeMe-2569` (it must be
  changed at the first sign-in), and `admin` (Admin) with the password of the old single account. Projects and
  events saved before accounts existed belong to `admin`.
- **Develop** (`ng serve`): `superadmin` / `super1234`, `admin` / `admin1234`, `user1` and `user2` / `user1234`.
  The login page lists them; click one to fill the form.

To start over in a browser, remove `awp:users:v1` from its localStorage (the projects and events stay).

What it protects: everything is checked in the browser, so it keeps casual visitors and colleagues apart but is not
real security. Anyone who knows how can edit the browser's storage, and each browser has its own accounts and data.
Real accounts shared between browsers come with the server in [golive-plan.md](golive-plan.md).

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

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

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
