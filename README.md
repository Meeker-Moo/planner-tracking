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

## Login

The first page, Excel Compare (`/excel`), is open to everyone. Every other page (Dashboard, the project list,
Timeline, Monthly Report) needs a login with the one fixed account set in
[src/app/core/auth/auth.config.ts](src/app/core/auth/auth.config.ts). A login lasts until the tab is closed, or
30 days on that browser when "จดจำการเข้าสู่ระบบ" is ticked.

In the develop environment (`ng serve`, or `ng build --configuration development`) the login is skipped: every page
opens signed in as that account, shown as "(develop)" in the toolbar. The environment comes from
[src/environments/](src/environments/); production builds (`ng build`, GitHub Pages) always ask for the login.

To change the account, print the hash of `username:password` and paste it with the username into that file:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('admin:NEW-PASSWORD').digest('hex'))"
```

What it protects: the login is checked in the browser, so it keeps casual visitors from using the other pages but
is not real security. The site's files stay public on GitHub Pages, and anyone who knows how can edit the browser's
storage to get past the check. The hash is visible in the site's code too, so use a long password that is not used
anywhere else. To actually lock the site, put it behind the host's own sign-in (for example Cloudflare Access or a
password-protected Netlify site) or move sign-in to a service such as Firebase Authentication.

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
