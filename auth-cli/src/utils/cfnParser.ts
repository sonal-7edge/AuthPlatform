import yaml from 'js-yaml';
import {
  AppClient,
  AuthConfig,
  AwsRegion,
  CustomAttribute,
  LambdaTriggers,
  MfaMethod,
  SignInOption,
} from '../types';

// auth-cli's own templates only ever emit these three CloudFormation intrinsics
// (see cfnGenerator.ts) — construct them as plain objects so js-yaml can parse
// a generated template back in, the same shape CloudFormation itself uses.
const CFN_SCHEMA = yaml.DEFAULT_SCHEMA.extend([
  new yaml.Type('!Ref', {
    kind: 'scalar',
    construct: (data: string) => ({ Ref: data }),
  }),
  new yaml.Type('!Sub', {
    kind: 'scalar',
    construct: (data: string) => ({ 'Fn::Sub': data }),
  }),
  new yaml.Type('!GetAtt', {
    kind: 'scalar',
    construct: (data: string) => ({ 'Fn::GetAtt': data }),
  }),
]);

export function parseCfnYaml(content: string): unknown {
  return yaml.load(content, { schema: CFN_SCHEMA });
}

export function isCfnTemplate(doc: unknown): boolean {
  return !!doc && typeof doc === 'object' && 'Resources' in (doc as Record<string, unknown>);
}

const CFN_TRIGGER_KEYS: Record<string, keyof LambdaTriggers> = {
  PreSignUp: 'preSignUp',
  PostConfirmation: 'postConfirmation',
  PreAuthentication: 'preAuthentication',
  PostAuthentication: 'postAuthentication',
  CustomMessage: 'customMessage',
  PreTokenGeneration: 'preTokenGeneration',
  UserMigration: 'userMigration',
  DefineAuthChallenge: 'defineChallenge',
  CreateAuthChallenge: 'createChallenge',
  VerifyAuthChallengeResponse: 'verifyChallenge',
};

const EMPTY_LAMBDA_TRIGGERS: LambdaTriggers = {
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
};

/**
 * Reconstructs an AuthConfig from a CloudFormation template that auth-cli
 * generated. Lets `generate` treat the template itself as the source of
 * truth instead of a separate auth-config.yaml.
 */
export function cfnTemplateToAuthConfig(doc: any): AuthConfig {
  const resources = doc.Resources ?? {};
  const userPool = resources.UserPool?.Properties ?? {};
  const metadata = doc.Metadata?.AuthCli ?? {};

  const region = (metadata.Region ?? 'us-east-1') as AwsRegion;

  const poolNameSub: string = userPool.UserPoolName?.['Fn::Sub'] ?? '';
  const poolName = poolNameSub.replace(/-\$\{Environment\}$/, '');

  const aliasAttrs: string[] = userPool.AliasAttributes ?? [];
  const signInOptions: SignInOption[] = aliasAttrs.length
    ? (aliasAttrs.map((a) => (a === 'phone_number' ? 'phone' : 'email')) as SignInOption[])
    : ['username'];

  const autoVerifiedAttrs: string[] = userPool.AutoVerifiedAttributes ?? [];
  const emailVerification = autoVerifiedAttrs.includes('email');
  const deletionProtection = userPool.DeletionProtection === 'ACTIVE';
  const selfSignup = !userPool.AdminCreateUserConfig?.AllowAdminCreateUserOnly;

  const pw = userPool.Policies?.PasswordPolicy ?? {};
  const passwordPolicy = {
    minLength: pw.MinimumLength ?? 8,
    requireUppercase: !!pw.RequireUppercase,
    requireLowercase: !!pw.RequireLowercase,
    requireNumbers: !!pw.RequireNumbers,
    requireSymbols: !!pw.RequireSymbols,
    tempPasswordDays: pw.TemporaryPasswordValidityDays ?? 7,
  };

  const mfaConfiguration: string = userPool.MfaConfiguration ?? 'OFF';
  const enabledMfas: string[] = userPool.EnabledMfas ?? [];
  const methods: MfaMethod[] = [];
  if (enabledMfas.includes('SOFTWARE_TOKEN_MFA')) methods.push('totp');
  if (enabledMfas.includes('SMS_MFA')) methods.push('sms');
  const mfa = {
    enabled: mfaConfiguration !== 'OFF',
    mode: (mfaConfiguration === 'ON'
      ? 'required'
      : mfaConfiguration === 'OPTIONAL'
        ? 'optional'
        : 'off') as AuthConfig['mfa']['mode'],
    methods,
  };

  const schema: any[] = userPool.Schema ?? [];
  const customAttributes: CustomAttribute[] = schema
    .filter((s) => s.Name !== 'email' && s.Name !== 'name')
    .map((s) => {
      const attr: CustomAttribute = {
        name: s.Name,
        type: s.AttributeDataType,
        required: !!s.Required,
        mutable: !!s.Mutable,
      };
      if (s.StringAttributeConstraints) {
        attr.minLength = Number(s.StringAttributeConstraints.MinLength);
        attr.maxLength = Number(s.StringAttributeConstraints.MaxLength);
      }
      if (s.NumberAttributeConstraints) {
        attr.minValue = Number(s.NumberAttributeConstraints.MinValue);
        attr.maxValue = Number(s.NumberAttributeConstraints.MaxValue);
      }
      return attr;
    });

  const lambdaConfig = userPool.LambdaConfig ?? {};
  const lambdaTriggers: LambdaTriggers = { ...EMPTY_LAMBDA_TRIGGERS };
  Object.entries(CFN_TRIGGER_KEYS).forEach(([cfnKey, ourKey]) => {
    const value = lambdaConfig[cfnKey];
    if (typeof value === 'string') {
      lambdaTriggers[ourKey] = value;
    }
  });

  const appClients: AppClient[] = Object.values(resources)
    .filter((r: any) => r?.Type === 'AWS::Cognito::UserPoolClient')
    .map((r: any): AppClient => {
      const p = r.Properties ?? {};
      return {
        name: p.ClientName ?? '',
        generateSecret: !!p.GenerateSecret,
        authFlows: p.ExplicitAuthFlows ?? [],
        accessTokenValidity: p.AccessTokenValidity ?? 60,
        idTokenValidity: p.IdTokenValidity ?? 60,
        refreshTokenValidity: p.RefreshTokenValidity ?? 30,
        callbackUrls: p.CallbackURLs ?? [],
        logoutUrls: p.LogoutURLs ?? [],
      };
    });

  return {
    provider: 'aws',
    region,
    poolName,
    selfSignup,
    emailVerification,
    deletionProtection,
    signInOptions,
    passwordPolicy,
    mfa,
    appClients,
    lambdaTriggers,
    customAttributes,
  };
}
