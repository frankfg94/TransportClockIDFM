# Android APK Distribution

This feature is isolated in `src/features/mobile-release`, `server/services/mobileRelease`, and `scripts/mobile-release`.
By default, it offers the latest valid published Android APK. It does not depend on `CF_PAGES_COMMIT_SHA`, nor on a Pages deployment happening at the same time as the Android build.

If `CF_PAGES_COMMIT_SHA` is available, the app prefers the APK built from the same commit. This is an optional extra check: if that APK is not found, the latest valid release remains downloadable.

## R2 Storage and Cloudflare Pages

1. Create an R2 bucket, for example `transport-clock-mobile-releases`.
2. The recommended private mode uses an optional Pages binding named `MOBILE_RELEASES_BUCKET`, read-only from Nitro routes.
3. Deploy the application. In private mode, these routes become available:
   - `GET /api/mobile/android/release` returns the latest valid release; `?revision=<sha>` prefers the release from that commit when it exists.
   - `GET /api/mobile/android/release/download?revision=<sha>` downloads the validated APK with `Content-Disposition`.

Objects are written under `mobile-releases/android/<commit-sha>/`, with a manifest at `mobile-releases/android/latest.json` updated on every publication. The server verifies the manifest schema, file size, SHA-256 hashes, and expected path before offering the download. The Pages binding contains no R2 write credentials.

### Public Access Without the Pages Server (Optional)

To avoid depending on the Pages server, attach a public domain to the R2 bucket and define this variable for the Nuxt/Capacitor build:

```env
NUXT_PUBLIC_MOBILE_RELEASE_BASE_URL=https://downloads.example.com
```

The app then reads `https://downloads.example.com/mobile-releases/android/latest.json` directly and downloads the APK from the same domain. Without this variable, it automatically uses the Pages API and its private R2 binding.

## GitHub Actions Configuration

The workflow `.github/workflows/mobile-release.yml` runs on every push to `main` and can also be triggered manually. It builds and publishes a release versioned by the checkout commit, without waiting for the matching Pages deployment.

Add these GitHub secrets:

- `ANDROID_KEYSTORE_BASE64`: release `.jks` file encoded as Base64.
- `MOBILE_RELEASE_KEYSTORE_PASSWORD`, `MOBILE_RELEASE_KEY_ALIAS`, `MOBILE_RELEASE_KEY_PASSWORD`.
- `MOBILE_RELEASE_R2_ACCESS_KEY_ID`, `MOBILE_RELEASE_R2_SECRET_ACCESS_KEY`: R2 token scoped to the APK bucket only.

Add these non-secret GitHub variables:

- `NUXT_PUBLIC_API_BASE_URL`: HTTPS URL of the deployed Nuxt API.
- `NUXT_PUBLIC_MOBILE_RELEASE_BASE_URL`: public R2 domain, only for the serverless Pages mode.
- `MOBILE_RELEASE_R2_ENDPOINT`: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
- `MOBILE_RELEASE_R2_BUCKET`: private bucket name.

The GitHub run number becomes `versionCode`, so it increases for every release. The APK is verified by `apksigner`, and the signing certificate fingerprint is extracted automatically. The file SHA-256 and size are then written to the manifest. Above 25 MiB, publication fails; only a manual run with `approve_oversize=true` allows the exception. Publication keeps the ten most recent R2 releases.

## Local Publication

Copy `.env.mobile-release.example` to `.env.mobile-release`, fill in its variables, then run:

```powershell
npm run apk:build
npm run apk:publish
```

The scripts automatically load `.env.mobile-release` without overriding a variable explicitly provided by the terminal or GitHub Actions. `apk:build` generates `dist/mobile-release/manifest.json` and the signed APK. `apk:publish` reads and validates the APK again before any upload. By default, both commands reject a dirty Git tree, an inconsistent commit SHA, or an APK above 25 MiB. For the size exception only:

```powershell
npm run apk:build -- --approve-oversize
npm run apk:publish -- --approve-oversize
```

Keeping ten APKs caps storage around 250 MiB with the 25 MiB limit. Configure an R2 budget alert anyway: operations remain billable beyond the free quota.

### Explicit local worktree snapshot

The clean-tree rule remains the default. When the validated application includes
uncommitted changes, an explicitly authorised local release can use a deterministic
source snapshot. Do not commit early just to bypass the release gate.

Set the production HTTPS API, the chosen increasing version code/name and
`MOBILE_RELEASE_EXPECTED_CERTIFICATE_SHA256` (the existing public signing certificate)
in the shell. Set any other public build options before capturing the snapshot.

```powershell
node --import tsx scripts/mobile-release/capture.ts path/to/source-snapshot.json
node --import tsx scripts/mobile-release/build.ts --worktree-snapshot=path/to/source-snapshot.json --approve-oversize
# Install and smoke-test exactly the signed output before this command:
node --import tsx scripts/mobile-release/publish.ts --worktree-snapshot=path/to/source-snapshot.json --approve-oversize
```

Omit `--approve-oversize` unless the actual artifact exceeds 25 MiB and the exception
is authorised. Snapshot mode is refused in GitHub Actions. The snapshot hashes
tracked and new source files, deletions, public assets, build scripts, tests and
relevant public build configuration. Credentials, keystores, IDE files and generated
Android outputs are excluded. The package lock identifies dependencies; it does not
attest the contents of an arbitrarily modified node_modules installation.

`sourceRevision` is the first 40 hex characters of a domain-separated SHA-256
snapshot identity, for compatibility with existing release clients. It is **not a
Git commit**. Extra manifest fields identify `sourceKind: worktree-snapshot`, the
real `baseCommit` and full `snapshotSha256`. `provenance.json` stores the file hashes,
configuration and exact artifact manifest, and is uploaded beside the immutable APK.
Build rechecks stability after signing; publication checks it again before uploading.
Any source/configuration drift requires a new snapshot, rebuild and affected smoke.
Publication also refuses a non-increasing version code and replacement of an existing
release identity with different APK bytes. It retains the ten most recent releases.

The native build uses `.nuxt-mobile-release` to preserve a shared dev server's
`.nuxt`. Final builds refuse live reload and a non-production HTTP API.

After a local snapshot release, review `.github/workflows/mobile-release.yml`
**before pushing main**: every push triggers a separate commit-based build/publication,
which can differ from the tested worktree (including changes excluded from the
commit). The current workflow uses GitHub run_number as versionCode and does not
approve oversized push builds; increasing-code and size guards can reject it.
Do not treat a future CI binary as the manually validated APK. Coordinate an explicit
release decision before letting CI update latest.
