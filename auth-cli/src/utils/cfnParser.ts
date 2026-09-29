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
  const stackName = readTemplateStackName(doc);

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
    ...(stackName ? { stackName } : {}),
  };
}

// Stack name recorded by the last successful `auth deploy` (Metadata.AuthCli.StackName).
export function readTemplateStackName(doc: unknown): string | undefined {
  const value = (doc as { Metadata?: { AuthCli?: { StackName?: unknown } } } | null)?.Metadata
    ?.AuthCli?.StackName;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// Records the stack name in the template's `Metadata: AuthCli:` block with a line edit rather
// than a YAML round-trip, so hand edits, comments and CFN tags elsewhere in the file are kept.
// Returns null if the template has no AuthCli block to put it in.
export function setTemplateStackName(content: string, stackName: string): string | null {
  const lines = content.split('\n');

  let authCliIdx = -1;
  let section = '';
  for (let i = 0; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) section = lines[i].trim();
    if (section === 'Metadata:' && /^ {2}AuthCli:\s*$/.test(lines[i])) {
      authCliIdx = i;
      break;
    }
  }
  if (authCliIdx === -1) return null;

  let end = authCliIdx + 1;
  while (end < lines.length && /^ {4,}\S/.test(lines[end])) end++;

  // Quoted so names like `true` or `null` stay strings when read back.
  const entry = `    StackName: '${stackName}'`;
  const existing = lines
    .slice(authCliIdx + 1, end)
    .findIndex((line) => /^ {4}StackName:/.test(line));

  if (existing === -1) lines.splice(end, 0, entry);
  else lines[authCliIdx + 1 + existing] = entry;

  return lines.join('\n');
}
