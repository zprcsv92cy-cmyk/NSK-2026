"""Validate production D1/SQLite login-attempt schema without contacting production."""
import pathlib
import sqlite3

root = pathlib.Path(__file__).resolve().parents[1]
migration = (root / "migrations/production-auth/001_login_attempts.sql").read_text()
code = (root / "worker/production-login-guard.js").read_text()
connection = sqlite3.connect(":memory:")
connection.executescript(migration)
# Idempotent migration and enforcement of composite key and hash length.
connection.executescript(migration)
key = "a" * 64
bucket = "2026-10-17T17:45:00.000Z"
next_bucket = "2026-10-17T18:00:00.000Z"
upsert = """INSERT INTO auth_login_attempts(email_key,window_start,attempts)
 VALUES(?,?,1)
 ON CONFLICT(email_key,window_start)
 DO UPDATE SET attempts=attempts+1 RETURNING attempts"""
for expected in range(1, 10):
    row = connection.execute(upsert, (key, bucket)).fetchone()
    assert row == (expected,), (row, expected)
assert connection.execute(upsert, (key, next_bucket)).fetchone() == (1,)
assert connection.execute("SELECT count(*) FROM auth_login_attempts").fetchone() == (2,)
try:
    connection.execute(upsert, ("invalid", bucket))
    raise AssertionError("Invalid hash length was accepted")
except sqlite3.IntegrityError:
    pass
connection.execute(
    "DELETE FROM auth_login_attempts WHERE email_key=? AND window_start=?",
    (key, bucket),
)
assert connection.execute("SELECT count(*) FROM auth_login_attempts").fetchone() == (1,)
# Keep test bound to the production guard's current query shape.
for part in (
    "auth_login_attempts(email_key,window_start,attempts)",
    "ON CONFLICT(email_key,window_start)",
    "RETURNING attempts",
    "DELETE FROM auth_login_attempts WHERE email_key=? AND window_start=?",
):
    assert part in code, f"Login guard no longer matches migration: {part}"
print("PASS production login D1 migration idempotency, counter and cleanup")
