import { IDENTIFIER_TYPE } from '../core/constants'

export const MIN_PASSWORD_LENGTH = 8

// Deliberately permissive. The server is the authority on whether an address
// is real; the field's job is only to catch obvious typos before a round-trip.
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/
const PHONE_PATTERN = /^\+?\d{7,15}$/

/**
 * @param {string} value
 * @param {string} type one of IDENTIFIER_TYPE
 * @returns {string} error message, or '' when valid
 */
export function validateIdentifier(value, type) {
  const trimmed = String(value ?? '').trim()
  const isEmail = type === IDENTIFIER_TYPE.EMAIL

  if (!trimmed) return isEmail ? 'Email is required' : 'Phone number is required'
  if (isEmail && !EMAIL_PATTERN.test(trimmed)) return 'Enter a valid email address'
  if (!isEmail && !PHONE_PATTERN.test(trimmed.replace(/[\s()-]/g, ''))) {
    return 'Enter a valid phone number'
  }
  return ''
}

/**
 * @param {string} value
 * @param {{ label?: string }} [options]
 * @returns {string} error message, or '' when valid
 */
export function validatePassword(value, { label = 'Password' } = {}) {
  if (!value) return `${label} is required`
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `${label} must be at least ${MIN_PASSWORD_LENGTH} characters`
  }
  return ''
}

/**
 * @returns {string} error message, or '' when the two match
 */
export function validateConfirmation(password, confirmation) {
  if (!confirmation) return 'Confirm your password'
  if (password !== confirmation) return 'Passwords do not match'
  return ''
}
