import { ZodError } from 'zod';
import { AuthConfigSchema } from '../models/authConfigSchema';
import { ValidationResult } from '../types';
import {
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

export function validateRange(min: number, max: number, label: string) {
  return (value: number): true | string => {
    if (Number.isNaN(value) || value < min || value > max) {
      return `${label} must be between ${min} and ${max}`;
    }
    return true;
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
