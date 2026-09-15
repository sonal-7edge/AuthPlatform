import {
  validatePoolName,
  validateRange,
  validateAtLeastOne,
  validateUrl,
} from '../src/validators/configValidator';
import {
  AWS_REGION_CHOICES,
  SIGNIN_OPTION_CHOICES,
  MFA_MODE_CHOICES,
  MFA_METHOD_CHOICES,
  AUTH_FLOW_CHOICES,
  LAMBDA_TRIGGER_FIELDS,
  PROVIDER_CHOICES,
} from '../src/config/constants';

/**
 * Prompt flow tests validate the choices, constraints, and inline validators
 * that drive the inquirer prompts — without spawning a real interactive TTY.
 */
describe('Prompt choices and constants', () => {
  describe('PROVIDER_CHOICES', () => {
    it('includes aws as an enabled choice', () => {
      const aws = PROVIDER_CHOICES.find((c) => c.value === 'aws');
      expect(aws).toBeDefined();
      expect(aws?.disabled).toBeUndefined();
    });

    it('marks azure and gcp as disabled', () => {
      const azure = PROVIDER_CHOICES.find((c) => c.value === 'azure');
      const gcp = PROVIDER_CHOICES.find((c) => c.value === 'gcp');
      expect(azure?.disabled).toBeTruthy();
      expect(gcp?.disabled).toBeTruthy();
    });
  });

  describe('AWS_REGION_CHOICES', () => {
    it('contains exactly 17 regions', () => {
      expect(AWS_REGION_CHOICES).toHaveLength(17);
    });

    it('includes us-east-1', () => {
      expect(AWS_REGION_CHOICES.map((c) => c.value)).toContain('us-east-1');
    });

    it('every choice has a name and value', () => {
      AWS_REGION_CHOICES.forEach((choice) => {
        expect(typeof choice.name).toBe('string');
        expect(choice.name.length).toBeGreaterThan(0);
        expect(typeof choice.value).toBe('string');
      });
    });
  });

  describe('SIGNIN_OPTION_CHOICES', () => {
    it('includes email, phone, and username', () => {
      const values = SIGNIN_OPTION_CHOICES.map((c) => c.value);
      expect(values).toContain('email');
      expect(values).toContain('phone');
      expect(values).toContain('username');
    });

    it('contains exactly 3 sign-in options', () => {
      expect(SIGNIN_OPTION_CHOICES).toHaveLength(3);
    });
  });

  describe('MFA_MODE_CHOICES', () => {
    it('includes off, optional, and required', () => {
      const values = MFA_MODE_CHOICES.map((c) => c.value);
      expect(values).toEqual(['off', 'optional', 'required']);
    });
  });

  describe('MFA_METHOD_CHOICES', () => {
    it('includes totp and sms', () => {
      const values = MFA_METHOD_CHOICES.map((c) => c.value);
      expect(values).toEqual(['totp', 'sms']);
    });
  });

  describe('AUTH_FLOW_CHOICES', () => {
    it('does not include the always-on refresh token flow', () => {
      const values = AUTH_FLOW_CHOICES.map((c) => c.value);
      expect(values).not.toContain('ALLOW_REFRESH_TOKEN_AUTH');
    });

    it('includes SRP auth', () => {
      const values = AUTH_FLOW_CHOICES.map((c) => c.value);
      expect(values).toContain('ALLOW_USER_SRP_AUTH');
    });
  });

  describe('LAMBDA_TRIGGER_FIELDS', () => {
    it('contains exactly 10 trigger fields', () => {
      expect(LAMBDA_TRIGGER_FIELDS).toHaveLength(10);
    });

    it('every field has a key and label', () => {
      LAMBDA_TRIGGER_FIELDS.forEach((field) => {
        expect(typeof field.key).toBe('string');
        expect(typeof field.label).toBe('string');
        expect(field.label.length).toBeGreaterThan(0);
      });
    });
  });
});

describe('validatePoolName() (used in the User Pool step)', () => {
  const validNames = ['my-app', 'Project123', 'a', 'portal-v2', '123', 'my_app'];
  const invalidNames = ['', '  ', 'my app', 'my.app', 'my!app'];

  validNames.forEach((name) => {
    it(`accepts "${name}"`, () => {
      expect(validatePoolName(name)).toBe(true);
    });
  });

  invalidNames.forEach((name) => {
    it(`rejects "${name}"`, () => {
      const result = validatePoolName(name);
      expect(result).not.toBe(true);
      expect(typeof result).toBe('string');
    });
  });
});

describe('validateAtLeastOne() (used for sign-in options and MFA methods)', () => {
  const validate = validateAtLeastOne('Select at least one sign-in option');

  it('returns true when at least one item is selected', () => {
    expect(validate(['email'])).toBe(true);
    expect(validate(['email', 'phone'])).toBe(true);
  });

  it('returns an error string when nothing is selected', () => {
    expect(validate([])).not.toBe(true);
    expect(typeof validate([])).toBe('string');
  });
});

describe('validateRange() (used for password policy and token validity steps)', () => {
  it('accepts values within the min/max bounds', () => {
    const check = validateRange(1, 1440, 'Access token validity');
    expect(check(1)).toBe(true);
    expect(check(1440)).toBe(true);
  });

  it('rejects values outside the min/max bounds', () => {
    const check = validateRange(1, 1440, 'Access token validity');
    expect(check(0)).not.toBe(true);
    expect(check(1441)).not.toBe(true);
  });
});

describe('validateUrl() (used for callback/logout URL prompts)', () => {
  it('accepts a blank value so the URL loop can terminate', () => {
    expect(validateUrl('')).toBe(true);
  });

  it('accepts a well-formed URL', () => {
    expect(validateUrl('https://example.com/callback')).toBe(true);
  });

  it('rejects a malformed URL', () => {
    expect(validateUrl('not-a-url')).not.toBe(true);
  });
});
