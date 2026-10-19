window.APP_CONFIG = {
  API_URL: "https://nsk-api.peter-hasselberg.workers.dev",
  // Isolated auth service: personal sessions never go to the legacy API.
  AUTH_URL: "https://nsk-auth.peter-hasselberg.workers.dev",
  // Enable only after the scoped API Worker is deployed and verified.
  REQUIRE_SCOPED_ROSTER_READS: true,
  REQUIRE_SCOPED_TEAM_READS: true,
  REQUIRE_SCOPED_COLLECTION_READS: true,
  APP_VERSION: "baserow-readonly-1"
};
