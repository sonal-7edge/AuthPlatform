import { ZodError } from 'zod';
import { AuthConfigSchema } from '../models/authConfigSchema';
import { ValidationResult } from '../types';
import {
  APP_CLIENT_NAME_REGEX,
  CUSTOM_ATTRIBUTE_NAME_REGEX,
  POOL_NAME_REGEX,
  RESERVED_ATTRIBUTE_NAMES,
} from '../config/constants';

export class ConfigValidator {
  validate(data: unknown): ValidationResult {
    const result = AuthConfigSchema.safeParse(data);

    if (result.success) {
      return { valid: true, errors: [] };
    }

    return {
      valid: false,
      errors: this.formatErrors(result.error),
    };
  }

  private formatErrors(error: ZodError): string[] {
    return error.errors.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}` : 'root';
      return `[${path}] ${issue.message}`;
    });
  }
}

export function validatePoolName(name: string): true | string {
  if (!name || name.trim().length === 0) {
    return 'User pool name is required';
  }
  if (!POOL_NAME_REGEX.test(name)) {
    return 'User pool name must contain only letters, numbers, hyphens, and underscores';
  }
  return true;
}

export function validateAppClientName(name: string): true | string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return 'Client name is required';
  }
  if (!APP_CLIENT_NAME_REGEX.test(trimmed)) {
    return 'Client name must be 1-128 characters: letters, numbers, hyphens, and underscores only';
  }
  return true;
}

function isInRange(value: number, min: number, max: number): boolean {
  return !Number.isNaN(value) && value >= min && value <= max;
}

export function validateRange(min: number, max: number, label: string) {
  return (value: number | string): true | string => {
    const numericValue = typeof value === 'number' ? value : Number(value);
    return isInRange(numericValue, min, max) ? true : `${label} must be between ${min} and ${max}`;
  };
}

// Pairs with `validateRange` on `type: 'input'` number prompts (see authPrompts.ts). inquirer's
// `type: 'number'` prompt converts input to a JS `Number` before validation even runs, and on a
// validation failure its error-render path does `rl.cursor += value.length` — `.length` on a
// `Number` is `undefined`, so `rl.cursor` becomes `NaN` and the terminal cursor jumps to column 0
// instead of the end of the input, breaking backspace. Only converting to a number once the value
// is already known to be in range means an invalid entry stays a string, so `.length` stays valid
// and the cursor bug never triggers.
export function filterNumberInRange(min: number, max: number) {
  return (input: string): string | number => {
    const value = Number(String(input).trim());
    return isInRange(value, min, max) ? value : input;
  };
}

export function validateAtLeastOne(message: string) {
  return (selected: unknown[]): true | string => (selected.length === 0 ? message : true);
}

export function validateCustomAttributeName(name: string): true | string {
  const trimmed = name.trim();
  if (!CUSTOM_ATTRIBUTE_NAME_REGEX.test(trimmed)) {
    return 'Attribute name must be 1-20 characters: letters, numbers, and underscores only';
  }
  if (RESERVED_ATTRIBUTE_NAMES.includes(trimmed)) {
    return `"${trimmed}" is already a built-in attribute; choose a different name`;
  }
  return true;
}

export function validateUrl(value: string): true | string {
  if (!value || value.trim().length === 0) {
    return true;
  }
  try {
    new URL(value.trim());
    return true;
  } catch {
    return 'Must be a valid URL, e.g. https://example.com/callback';
  }
}
