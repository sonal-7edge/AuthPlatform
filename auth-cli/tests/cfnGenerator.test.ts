import { generateCfnTemplate } from '../src/utils/cfnGenerator';
import { AuthConfig } from '../src/types';

const baseConfig: AuthConfig = {
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
      callbackUrls: ['https://example.com/callback'],
      logoutUrls: ['https://example.com/logout'],
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

describe('generateCfnTemplate()', () => {
  it('includes the user pool name and region', () => {
    const template = generateCfnTemplate(baseConfig);
    expect(template).toContain("UserPoolName: !Sub 'my-app-users-${Environment}'");
    expect(template).toContain('Region: us-east-1');
  });

  it('sets AllowAdminCreateUserOnly to false when self-signup is allowed', () => {
    const template = generateCfnTemplate(baseConfig);
    expect(template).toContain('AllowAdminCreateUserOnly: false');
  });

  it('sets AllowAdminCreateUserOnly to true when self-signup is disabled', () => {
    const template = generateCfnTemplate({ ...baseConfig, selfSignup: false });
    expect(template).toContain('AllowAdminCreateUserOnly: true');
  });

  it('adds AliasAttributes for email and phone sign-in options', () => {
    const template = generateCfnTemplate({ ...baseConfig, signInOptions: ['email', 'phone'] });
    expect(template).toContain('AliasAttributes:');
    expect(template).toContain('- email');
    expect(template).toContain('- phone_number');
  });

  it('sets MfaConfiguration to OFF when MFA is disabled', () => {
    const template = generateCfnTemplate(baseConfig);
    expect(template).toContain("MfaConfiguration: 'OFF'");
  });

  it('sets MfaConfiguration to ON and lists enabled MFAs when required', () => {
    const template = generateCfnTemplate({
      ...baseConfig,
      mfa: { enabled: true, mode: 'required', methods: ['totp', 'sms'] },
    });
    expect(template).toContain("MfaConfiguration: 'ON'");
    expect(template).toContain('- SOFTWARE_TOKEN_MFA');
    expect(template).toContain('- SMS_MFA');
    expect(template).toContain('CognitoSMSRole');
    expect(template).toContain('SnsCallerArn: !GetAtt CognitoSMSRole.Arn');
  });

  it('sets MfaConfiguration to OPTIONAL when mode is optional', () => {
    const template = generateCfnTemplate({
      ...baseConfig,
      mfa: { enabled: true, mode: 'optional', methods: ['totp'] },
    });
    expect(template).toContain("MfaConfiguration: 'OPTIONAL'");
  });

  it('renders an AWS::Cognito::UserPoolClient resource per app client', () => {
    const template = generateCfnTemplate({
      ...baseConfig,
      appClients: [
        baseConfig.appClients[0],
        { ...baseConfig.appClients[0], name: 'mobile-client', callbackUrls: [], logoutUrls: [] },
      ],
    });
    expect(template).toContain('AppClientwebclient:');
    expect(template).toContain('AppClientmobileclient:');
    expect((template.match(/Type: AWS::Cognito::UserPoolClient/g) ?? []).length).toBe(2);
  });

  it('includes CallbackURLs and LogoutURLs only when present', () => {
    const withUrls = generateCfnTemplate(baseConfig);
    expect(withUrls).toContain('CallbackURLs:');
    expect(withUrls).toContain("- 'https://example.com/callback'");
    expect(withUrls).toContain('LogoutURLs:');

    const withoutUrls = generateCfnTemplate({
      ...baseConfig,
      appClients: [{ ...baseConfig.appClients[0], callbackUrls: [], logoutUrls: [] }],
    });
    expect(withoutUrls).not.toContain('CallbackURLs:');
    expect(withoutUrls).not.toContain('LogoutURLs:');
  });

  it('includes LambdaConfig only for configured triggers', () => {
    const template = generateCfnTemplate({
      ...baseConfig,
      lambdaTriggers: {
        ...baseConfig.lambdaTriggers,
        preSignUp: 'arn:aws:lambda:us-east-1:123456789012:function:pre-signup',
      },
    });
    expect(template).toContain('LambdaConfig:');
    expect(template).toContain(
      "PreSignUp: 'arn:aws:lambda:us-east-1:123456789012:function:pre-signup'",
    );

    const withoutTriggers = generateCfnTemplate(baseConfig);
    expect(withoutTriggers).not.toContain('LambdaConfig:');
  });

  it('exports ProjectName, the user pool, and the single client under plain names', () => {
    const template = generateCfnTemplate(baseConfig);
    expect(template).toContain("ProjectName:\n    Value: !Ref 'AWS::StackName'");
    expect(template).toContain('CognitoUserPoolId:');
    expect(template).toContain('CognitoUserPoolArn:');
    expect(template).toContain('CognitoUserPoolClientId:');
    expect(template).not.toContain('CognitoClientSecret:');
  });

  it('exports the client secret when GenerateSecret is enabled', () => {
    const template = generateCfnTemplate({
      ...baseConfig,
      appClients: [{ ...baseConfig.appClients[0], generateSecret: true }],
    });
    expect(template).toContain('CognitoUserPoolClientId:');
    expect(template).toContain(
      'CognitoClientSecret:\n    Value: !GetAtt AppClientwebclient.ClientSecret',
    );
  });

  it('falls back to per-client output names when there are multiple app clients', () => {
    const template = generateCfnTemplate({
      ...baseConfig,
      appClients: [
        { ...baseConfig.appClients[0], name: 'web-client', generateSecret: true },
        { ...baseConfig.appClients[0], name: 'mobile-client', generateSecret: false },
      ],
    });
    expect(template).toContain('AppClientwebclientId:');
    expect(template).toContain('AppClientwebclientSecret:');
    expect(template).toContain('AppClientmobileclientId:');
    expect(template).not.toContain('CognitoUserPoolClientId:');
    expect(template).not.toContain('CognitoClientSecret:');
  });
});
