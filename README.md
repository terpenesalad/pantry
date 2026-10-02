# Pantry

A single-file home food catalogue — pantry inventory, shopping list, recipes,
bar and meal planner. Runs as a web app (GitHub Pages) and builds to an
installable Android APK.

Everything lives in `index.html`: no build step, no framework, no bundler.
Open it in a browser and it works.

---

## Repository layout

| Path | What it is |
|---|---|
| `index.html` | The entire app — markup, styles and logic |
| `sw.js` | Service worker (web only; not bundled into the APK) |
| `manifest.json` | PWA manifest |
| `icon-192.png`, `icon-512.png` | App icons |
| `capacitor.config.json` | Android wrapper config |
| `scripts/prepare-www.mjs` | Copies the web app into `www/` for packaging |
| `scripts/android-icons.mjs` | Writes the app icon into Android's launcher slots |
| `.github/workflows/android.yml` | Builds the APK and publishes a Release |
| `.github/workflows/pages.yml` | Deploys the web app to GitHub Pages |

`node_modules/`, `www/`, `android/` and `dist/` are all generated and
git-ignored. Nothing in the repo needs compiling to edit the app.

---

## Getting the APK

Push to `main` and the **Build Android APK** workflow produces one
automatically. Two modes:

- **Push to `main`** → updates the rolling `latest` pre-release.
- **Push a tag** like `v1.2.0` → creates a proper versioned release.

```bash
git tag v1.2.0
git push origin v1.2.0
```

Then open **Releases**, download the `.apk`, and open it on your phone.
Android asks permission to install from this source the first time.

The `versionCode` comes from the workflow run number, so it always increases
and Android never refuses an update as "older".

---

## Signing

Worth doing once. Without a signing key the workflow still builds a **debug**
APK you can install, but its signature is regenerated every run, so Android
treats each build as a different app — you have to uninstall before
reinstalling, which wipes the app's local data.

With a key, builds install straight over the top and your data survives.

**1. Generate a keystore** (keep the file somewhere safe and private):

```bash
keytool -genkeypair -v \
  -keystore pantry-release.keystore \
  -alias pantry \
  -keyalg RSA -keysize 2048 -validity 10000
```

**2. Base64-encode it:**

```bash
base64 -w0 pantry-release.keystore > keystore.b64   # Linux
base64 -i pantry-release.keystore | tr -d '\n' > keystore.b64   # macOS
```

**3. Add four repository secrets** under
*Settings → Secrets and variables → Actions*:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contents of `keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you chose |
| `ANDROID_KEY_ALIAS` | `pantry` |
| `ANDROID_KEY_PASSWORD` | the key password you chose |

The next build is signed. Each release note states whether it was a signed
build, so you can tell at a glance.

> Never commit the keystore or its passwords. `.gitignore` already blocks
> `*.keystore` and `*.jks`.

---

## Web app

`pages.yml` publishes to `https://<user>.github.io/<repo>/` on every push to
`main`. Enable it once under *Settings → Pages → Source → GitHub Actions*.

The service worker is network-first for HTML and refreshes its cached copy on
every successful load, so a new deploy is picked up rather than being masked
by a stale cache. When a newer build is detected the app offers a **Refresh**
prompt instead of swapping underneath you mid-edit.

Bump `VERSION` at the top of `sw.js` if you ever need to force a clean cache.

---

## How your data is stored

All data is local to the device. Nothing is uploaded.

- **IndexedDB** is the system of record. It has far more room than
  `localStorage` and the app asks the OS to mark it persistent so it is not
  evicted when storage runs low.
- **localStorage** is kept as a synchronous mirror purely so the app paints
  instantly on launch instead of waiting for an async read. A second copy
  under a `_bak` key allows recovery from a corrupt write.
- Writes are debounced (250 ms) and flushed on `pagehide`,
  `beforeunload` and `visibilitychange`, because iOS and Android freeze and
  then kill backgrounded apps without warning.
- On boot the app compares the two stores and adopts whichever is newer.

If both stores fail you get a persistent warning bar rather than silent data
loss. A full `localStorage` alone is survivable and deliberately does **not**
raise an alarm.

**Export a backup** from the Backup button in the header before any risky
change. That file is the only copy that outlives the device.

---

## Smart categorisation

Items are filed automatically using a classifier tuned for Coles, Woolworths
and ALDI product naming. It strips own-brand prefixes and pack sizes, so
`Coles Free Range Eggs 12 Pack` and `Eggs` land in the same place, and the
longest matching keyword wins so `ice cream` beats `cream`.

The guess fills in the category and storage location as you type, and stops
the moment you pick a category yourself.

To tidy up items that were filed before this existed: **Categories →
Auto-sort**. It previews what it would change before you commit, and there is
an Undo afterwards.

Three categories exist to give the classifier somewhere sensible to put
things: **Frozen**, **Snacks & Sweets** and **Household**. Delete any you
don't want.

---

## Firebase

The share / Kami Notes feature uses a Firebase Realtime Database to pass
payloads between devices. The config in `index.html` is a public client
config, which is normal — it is not a secret.

**Your database rules are the only access control.** Since this repo and the
Pages site are public, anyone can read that config, so make sure the rules in
the Firebase console restrict access to the paths this app actually uses
rather than leaving the database world-readable and world-writable.

---

## Local development

Just open `index.html` in a browser. For service-worker testing you need a
real origin:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

To build an APK locally:

```bash
npm install
npm run prepare:www
npx cap add android          # first time only
node scripts/android-icons.mjs
cd android && ./gradlew assembleDebug
# APK lands in android/app/build/outputs/apk/debug/
```

Requires JDK 21 and the Android SDK.
