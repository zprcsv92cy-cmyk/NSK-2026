// Browser-independent validation for the future account activation flow.
// This module contains no credentials and can be unit-tested without Cloudflare.
export const ACTIVATION_MIN_PASSWORD_LENGTH = 12;
export const ACTIVATION_MAX_PASSWORD_LENGTH = 1024;
export const ACTIVATION_TOKEN_LIFETIME_MINUTES = 120;
export function validActivationPassword(value) {
  return typeof value === 'string' && value.length >= ACTIVATION_MIN_PASSWORD_LENGTH && value.length <= ACTIVATION_MAX_PASSWORD_LENGTH;
}
export function validActivationToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}
