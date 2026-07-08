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

The scripts automatically load `.env.mobile-release` without overriding a variable explicitly provided by the terminal or GitHub Actions. `apk:build` generates `dist/mobile-release/manifest.json` and the signed APK. `apk:publish` reads and validates the APK again before any upload. Both commands reject a dirty Git tree, an inconsistent commit SHA, or an APK above 25 MiB. For the size exception only:

```powershell
npm run apk:build -- --approve-oversize
npm run apk:publish -- --approve-oversize
```

Keeping ten APKs caps storage around 250 MiB with the 25 MiB limit. Configure an R2 budget alert anyway: operations remain billable beyond the free quota.
