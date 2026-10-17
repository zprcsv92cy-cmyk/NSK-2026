# First production administrator: operational checklist

The production authentication Worker is deployed, but deployment alone does not create an administrator account.

1. Confirm the production D1 database has the expected authentication schema and the `auth_global_admins` table.
2. Provision the designated administrator through an approved, authenticated Cloudflare database administration session. The account must remain disabled until activation.
3. Assign the global administrator record and an explicit `users:manage` grant. Add the initial team membership separately.
4. Issue a single-use activation token through an approved administrator-only process. Never commit tokens or passwords to GitHub or paste them into logs.
5. Activate the account through `POST /api/auth/activate` over HTTPS. Verify login, permissions and team isolation.
6. Only then switch the frontend away from staging.

Do not introduce a public bootstrap endpoint or a default password. Do not claim that the administrator exists until the production database and login are verified.
