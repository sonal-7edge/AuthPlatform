import {
  ConfigValidator,
  validatePoolName,
  validateRange,
  validateAtLeastOne,
  validateUrl,
} from '../src/validators/configValidator';
import { AuthConfig } from '../src/types';

const validConfig: AuthConfig = {
  provider: 'aws',
  region: 'us-east-1',
  poolName: 'my-app-users',
  selfSignup: true,
  emailVerification: true,
  deletionProtection: true,
  customAttributes: [],
  signInOptions: ['email'],
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSymbols: false,
    tempPasswordDays: 7,
  },
  mfa: { enabled: false, mode: 'off', methods: [] },
  appClients: [
    {
      name: 'web-client',
      generateSecret: false,
      authFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      accessTokenValidity: 60,
      idTokenValidity: 60,
      refreshTokenValidity: 30,
      callbackUrls: [],
      logoutUrls: [],
    },
  ],
  lambdaTriggers: {
    preSignUp: '',
    postConfirmation: '',
    preAuthentication: '',
    postAuthentication: '',
    customMessage: '',
    preTokenGeneration: '',
    userMigration: '',
    defineChallenge: '',
    createChallenge: '',
    verifyChallenge: '',
  },
};

describe('ConfigValidator', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    validator = new ConfigValidator();
  });

  describe('validate()', () => {
    it('returns valid=true for a correct config', () => {
      const result = validator.validate(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid=false when pool name is missing', () => {
      const config = { ...validConfig, poolName: '' };
      const result = validator.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('poolName'))).toBe(true);
    });

    it('returns valid=false for pool name with invalid characters', () => {
      const config = { ...validConfig, poolName: 'my app!' };
      const result = validator.validate(config);
      expect(result.valid).toBe(false);
    });

    it('allows hyphens, underscores, and numbers in pool name', () => {
      const config = { ...validConfig, poolName: 'my-app_users-123' };
      const result = validator.validate(config);
      expect(result.valid).toBe(true);
    });

    it('returns valid=false when no sign-in options are selected', () => {
      const config = { ...validConfig, signInOptions: [] };
      const result = validator.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('signInOptions'))).toBe(true);
    });

    it('accepts all valid sign-in options', () => {
      const config = { ...validConfig, signInOptions: ['email', 'phone', 'username'] };
      const result = validator.validate(config);
      expect(result.valid).toBe(true);
    });

    it('returns valid=false for an invalid region', () => {
      const config = { ...validConfig, region: 'mars-central-1' };
      const result = validator.validate(config);
      expect(result.valid).toBe(false);
    });

    it('returns valid=false for a non-aws provider', () => {
      const config = { ...validConfig, provider: 'azure' };
      const result = validator.validate(config);
      expect(result.valid).toBe(false);
    });

    it('returns valid=false when MFA is enabled with no methods', () => {
      const config = { ...validConfig, mfa: { enabled: true, mode: 'optional', methods: [] } };
      const result = validator.validate(config);
      expect(result.valid).toBe(false);
    });

    it('returns valid=true when MFA is enabled with a method', () => {
      const config = {
        ...validConfig,
        mfa: { enabled: true, mode: 'required', methods: ['totp'] },
      };
      const result = validator.validate(config);
      expect(result.valid).toBe(true);
    });

    it('returns valid=false when an app client is missing ALLOW_REFRESH_TOKEN_AUTH', () => {
      const config = {
        ...validConfig,
        appClients: [{ ...validConfig.appClients[0], authFlows: ['ALLOW_USER_SRP_AUTH'] }],
      };
      const result = validator.validate(config);
      expect(result.valid).toBe(false);
    });

    it('returns valid=false when no app clients are configured', () => {
      const config = { ...validConfig, appClients: [] };
      const result = validator.validate(config);
      expect(result.valid).toBe(false);
    });

    it('returns valid=false for an invalid callback URL', () => {
      const config = {
        ...validConfig,
        appClients: [{ ...validConfig.appClients[0], callbackUrls: ['not-a-url'] }],
      };
      const result = validator.validate(config);
      expect(result.valid).toBe(false);
    });

    it('returns valid=false for a malformed lambda trigger ARN', () => {
      const config = {
        ...validConfig,
        lambdaTriggers: { ...validConfig.lambdaTriggers, preSignUp: 'not-an-arn' },
      };
      const result = validator.validate(config);
      expect(result.valid).toBe(false);
    });

    it('returns valid=true for a well-formed lambda trigger ARN', () => {
      const config = {
        ...validConfig,
        lambdaTriggers: {
          ...validConfig.lambdaTriggers,
          preSignUp: 'arn:aws:lambda:us-east-1:123456789012:function:my-fn',
        },
      };
      const result = validator.validate(config);
      expect(result.valid).toBe(true);
    });

    it('returns valid=false for non-object input', () => {
      const result = validator.validate(null);
      expect(result.valid).toBe(false);
    });

    it('includes multiple errors when multiple fields are invalid', () => {
      const config = { ...validConfig, poolName: '', signInOptions: [] };
      const result = validator.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('validatePoolName()', () => {
  it('returns true for valid names', () => {
    expect(validatePoolName('my-app')).toBe(true);
    expect(validatePoolName('App_123')).toBe(true);
    expect(validatePoolName('a')).toBe(true);
  });

  it('returns an error string for empty name', () => {
    expect(validatePoolName('')).not.toBe(true);
    expect(validatePoolName('   ')).not.toBe(true);
  });

  it('returns an error string for names with spaces or special characters', () => {
    expect(validatePoolName('my app')).not.toBe(true);
    expect(validatePoolName('my.app')).not.toBe(true);
    expect(validatePoolName('my!app')).not.toBe(true);
  });
});

describe('validateRange()', () => {
  const inRange = validateRange(6, 20, 'Minimum length');

  it('returns true within range', () => {
    expect(inRange(6)).toBe(true);
    expect(inRange(20)).toBe(true);
    expect(inRange(8)).toBe(true);
  });

  it('returns an error string outside range', () => {
    expect(inRange(5)).not.toBe(true);
    expect(inRange(21)).not.toBe(true);
  });
});

describe('validateAtLeastOne()', () => {
  const validate = validateAtLeastOne('Select at least one authentication method');

  it('returns true when at least one item is selected', () => {
    expect(validate(['otp'])).toBe(true);
    expect(validate(['google', 'apple'])).toBe(true);
  });

  it('returns an error string when nothing is selected', () => {
    expect(validate([])).not.toBe(true);
    expect(typeof validate([])).toBe('string');
  });
});

describe('validateUrl()', () => {
  it('accepts an empty value', () => {
    expect(validateUrl('')).toBe(true);
    expect(validateUrl('   ')).toBe(true);
  });

  it('accepts a valid URL', () => {
    expect(validateUrl('https://example.com/callback')).toBe(true);
  });

  it('rejects an invalid URL', () => {
    expect(validateUrl('not-a-url')).not.toBe(true);
  });
});
