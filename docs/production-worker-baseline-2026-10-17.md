# Verified Cloudflare production Worker baseline

Worker: `nsk-api`. Latest deployment: `17408693-062c-4f71-b36e-9eb37881536e` at `2026-10-13T15:02:54.622304Z` (UTC). Version: `95247668-0e10-4ba3-b6c5-469ed37a986c`.

Cloudflare Workers API successfully returned the deployed script on 2026-10-17 (multipart response, 47,235 characters). This is a provenance record, **not** an independent source backup or a verified checksum.

**Do not deploy** the production candidate as-is: unmigrated legacy API routes return 503. The historical `reference/legacy-nsk-api-worker-v42.snapshot.js` is not verified byte-for-byte against Cloudflare. Securely archive the actual Worker bundle and bindings outside this public repository and verify restoration before replacing production. Never commit secrets.

GitHub main branch is protected: changes require a pull request and two passing checks.
