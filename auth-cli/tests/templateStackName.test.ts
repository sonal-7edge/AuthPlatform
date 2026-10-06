import { generateCfnTemplate } from '../src/utils/cfnGenerator';
import {
  cfnTemplateToAuthConfig,
  parseCfnYaml,
  readTemplateStackName,
  setTemplateStackName,
} from '../src/utils/cfnParser';
import { AuthConfig } from '../src/types';

const config: AuthConfig = {
  provider: 'aws',
  region: 'ap-south-1',
  poolName: 'test-pool',
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
    requireSymbols: true,
    tempPasswordDays: 7,
  },
  mfa: { enabled: false, mode: 'off', methods: [] },
  appClients: [
    {
      name: 'test-client',
      generateSecret: true,
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

describe('template stack name', () => {
  it('has no stack name before the first deploy', () => {
    const doc = parseCfnYaml(generateCfnTemplate(config));
    expect(readTemplateStackName(doc)).toBeUndefined();
  });

  it('adds StackName to the AuthCli metadata and leaves the rest of the template untouched', () => {
    const original = generateCfnTemplate(config);
    const updated = setTemplateStackName(original, 'auth-service');

    expect(updated).not.toBeNull();
    expect(updated).toContain("    Region: ap-south-1\n    StackName: 'auth-service'\n");
    expect(updated!.replace("    StackName: 'auth-service'\n", '')).toBe(original);
    expect(readTemplateStackName(parseCfnYaml(updated!))).toBe('auth-service');
  });

  it('replaces an existing StackName instead of adding a second one', () => {
    const once = setTemplateStackName(generateCfnTemplate(config), 'auth-service')!;
    const twice = setTemplateStackName(once, 'auth-service-v2')!;

    expect(twice.match(/StackName:/g)).toHaveLength(1);
    expect(readTemplateStackName(parseCfnYaml(twice))).toBe('auth-service-v2');
  });

  it('keeps names that look like YAML keywords as strings', () => {
    const updated = setTemplateStackName(generateCfnTemplate(config), 'true')!;
    expect(readTemplateStackName(parseCfnYaml(updated))).toBe('true');
  });

  it('returns null when the template has no AuthCli metadata block', () => {
    const template =
      "AWSTemplateFormatVersion: '2010-09-09'\nResources:\n  UserPool:\n    Type: AWS::Cognito::UserPool\n";
    expect(setTemplateStackName(template, 'auth-service')).toBeNull();
  });

  it('survives regenerating the template from itself (e.g. add-client)', () => {
    const deployed = setTemplateStackName(generateCfnTemplate(config), 'auth-service')!;
    const regenerated = generateCfnTemplate(cfnTemplateToAuthConfig(parseCfnYaml(deployed)));

    expect(readTemplateStackName(parseCfnYaml(regenerated))).toBe('auth-service');
  });
});
