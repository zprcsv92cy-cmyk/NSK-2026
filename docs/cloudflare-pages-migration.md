# Cloudflare Pages migration — prepared, not activated

Target: https://nsk18.pages.dev
Repository: zprcsv92cy-cmyk/NSK-2026
Production branch: main; preview deployments: none.
Build command: node scripts/build-cloudflare-pages.mjs
Output directory: _site

Cloudflare project creation is blocked by HTTP 401 / 8000011: internal issue with the Cloudflare Pages Git installation. Project ownership and subdomain availability remain unverified. Reconnect the Cloudflare GitHub installation and grant access to this repository before retrying creation. Do not create a Direct Upload project as a substitute for Git integration.

The frontend build is ready and copies only public frontend files. Existing relative URLs work at the domain root, and /NSK-2026/* redirects to the corresponding root path. API URLs remain unchanged.

The production API and auth source are prepared to accept the exact additional origin only when NSK_PAGES_MIGRATION_ENABLED=true. Keep this flag absent until ownership of nsk18.pages.dev is confirmed. The old origin continues working. Activation/recovery links switch to the new root only with the same flag. These backend changes have not been deployed.

After Git connection is restored:
1. Create the Git-linked nsk project with main only and the build settings above.
2. Publish main and verify deployment status and exact subdomain (do not accept a generated alternate subdomain).
3. Deploy the prepared API/auth changes, preserving all existing bindings, secrets, authorization and data. Enable the migration flag only after project ownership is confirmed.
4. Verify both origins, authentication, read permissions and team membership using read-only production checks. Use synthetic fixtures for write tests; do not change Baserow production data.
5. Verify new-origin login and navigation, PWA paths, links, and continued access on the old site. A new origin requires a new login.
6. Only after verification, make the repository private. Check GitHub plan eligibility first: on GitHub Free this can unpublish the old Pages website. Do not promise its availability after that step without checking eligibility.

Validation: frontend build passed; 746 tests passed. New-site live login/team verification is blocked because the project has not been created.
