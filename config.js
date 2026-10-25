window.APP_CONFIG = {
  API_URL: "https://nsk-api.peter-hasselberg.workers.dev",
  // Isolated auth service: personal sessions never go to the legacy API.
  AUTH_URL: "https://nsk-auth.peter-hasselberg.workers.dev",
  // Enable only after the scoped API Worker is deployed and verified.
  REQUIRE_SCOPED_ROSTER_READS: true,
  REQUIRE_SCOPED_TEAM_READS: true,
  REQUIRE_SCOPED_COLLECTION_READS: true,
  // Enable only after the production API's personal pool-write guard is deployed and verified.
  REQUIRE_PERSONAL_POOL_WRITES: true,
  REQUIRE_PERSONAL_MATCH_WRITES: true,
  // Prepared client flow. Turn on only after live team-specific write checks pass.
  REQUIRE_PERSONAL_ROSTER_WRITES: true,
  REQUIRE_PERSONAL_COACH_SELECTION: false,
  APP_VERSION: "baserow-readonly-1"
};
