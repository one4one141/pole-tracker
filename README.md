# Pole Tracker — GitHub Pages + Supabase

A static, GitHub Pages-compatible shared pole tracking app. It supports a single shared password, separate projects for each spreadsheet upload, British National Grid references, map markers, searchable pole lists, and shared editing of status, notes, and imported spreadsheet fields.

## Important security notes

- **Do not put the shared password, `SESSION_SECRET`, or Supabase service-role key in this repository.** They belong only in Supabase Edge Function secrets.
- The password previously shared in the ChatGPT conversation should be considered exposed. Choose a new password before launch.
- GitHub Pages serves a public website by default, even if the source repository is private. The login screen can be reached by anyone; pole data and write operations are protected by the Edge Function. If the website itself must be inaccessible before login, GitHub Pages is not the right hosting option without an additional access-control layer.
- A shared password does not identify individual editors. Everyone who knows it has the same access; individual audit trails and per-person revocation are not possible.
- This is a starter implementation. Before wider production use, add rate limiting, audit logging, backup/restore, and test it with representative work spreadsheets.

## 1. Create a Supabase project

1. Create a project at https://supabase.com.
2. Open **SQL Editor** and run the complete contents of `supabase/schema.sql`.
3. In **Project Settings → API**, note the Project URL and the `anon` / publishable key. The service-role key is secret and must never be used in GitHub Actions or the browser.

## 2. Configure the Edge Function

Install the Supabase CLI, sign in, and link this local project to your Supabase project:

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Set the function secrets. Use a new strong shared password and generate a long random session secret (for example, `openssl rand -hex 32`):

```bash
supabase secrets set SHARED_PASSWORD='CHOOSE-A-NEW-STRONG-PASSWORD' SESSION_SECRET='PASTE-A-RANDOM-64-CHAR-HEX-SECRET' SUPABASE_URL='https://YOUR_PROJECT_REF.supabase.co' SUPABASE_SERVICE_ROLE_KEY='YOUR_SERVICE_ROLE_KEY'
```

Deploy the function:

```bash
supabase functions deploy pole-api --no-verify-jwt
```

The function validates its own short-lived signed session token. `--no-verify-jwt` is required because the app uses that signed token rather than a Supabase Auth JWT. The function still requires the Supabase anon key header and checks its own session on every data operation.

## 3. Add the public Supabase settings to GitHub

In the GitHub repository `one4one141/pole-tracker`, open **Settings → Secrets and variables → Actions → Variables** and create:

- `VITE_SUPABASE_FUNCTION_URL` = `https://YOUR_PROJECT_REF.supabase.co/functions/v1/pole-api`
- `VITE_SUPABASE_ANON_KEY` = your Supabase anon / publishable key

These are public client settings, not secrets. Never add `SHARED_PASSWORD` or `SUPABASE_SERVICE_ROLE_KEY` here.

## 4. Upload this project to the empty GitHub repository

Extract the ZIP. Upload the **contents** of the `pole-tracker-pages` folder to the root of the repository (so `package.json`, `src/`, `supabase/`, and `.github/` are at repository root). Commit them to the `main` branch.

## 5. Enable GitHub Pages

In GitHub, open **Settings → Pages**. Under **Build and deployment**, choose **GitHub Actions**. The included workflow builds the Vite app and publishes it whenever you push to `main`.

Your site address will be:

`https://one4one141.github.io/pole-tracker/`

Allow a few minutes for the first workflow to finish. Check the **Actions** tab if deployment fails.

## Spreadsheet format

The first worksheet is imported. Supported file types are `.xlsx`, `.xls`, and `.csv`. A grid-reference column should be headed with one of: `Grid Reference`, `Grid Ref`, `OS Grid Reference`, `OS Grid Ref`, `National Grid Reference`, or `NGR`. Pole identifiers are detected from `Pole Ref`, `Pole Number`, `Pole ID`, `Asset ID`, or `Reference`. Other columns are retained and editable in the pole detail panel.

Each upload creates a new project. Grid references are converted from EPSG:27700 (British National Grid) to WGS84 for map display. Rows without valid UK grid references are skipped.

## Local development

```bash
npm install
cp .env.example .env.local
# Fill in the two VITE_ values in .env.local
npm run dev
```

For a production-style build:

```bash
npm run build
npm run preview
```

## Known limitations for this first build

- One shared password and a 12-hour session; there are no individual accounts.
- Projects cannot yet be renamed or deleted from the UI.
- No export, undo, conflict-resolution UI, or audit history yet.
- The browser imports the first worksheet and sends the parsed rows to the Edge Function. The current import limit is 10,000 poles per upload.
- OpenStreetMap standard tiles are used; review their usage policy before sustained business use.
