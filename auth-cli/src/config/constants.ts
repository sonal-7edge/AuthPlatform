import {
  AuthFlow,
  AwsRegion,
  CustomAttributeType,
  MfaMethod,
  MfaMode,
  Provider,
  SignInOption,
} from '../types';

export const OUTPUT_FILE = 'auth-config.yaml';

export const CFN_OUTPUT_FILE = 'cognito-template.yaml';

// The generated CloudFormation template exposes this as an `Environment` Parameter
// (see cfnGenerator.ts) so the same template can be deployed to multiple stages —
// `auth deploy` overrides it via `--parameter-overrides Environment=<value>`.
export const DEPLOY_ENVIRONMENTS = ['dev', 'qa', 'pre-prod', 'prod'] as const;

export type DeployEnvironment = (typeof DEPLOY_ENVIRONMENTS)[number];

export const DEPLOY_ENVIRONMENT_CHOICES: Array<{ name: string; value: DeployEnvironment }> =
  DEPLOY_ENVIRONMENTS.map((value) => ({ name: value, value }));

export const PROVIDER_CHOICES: Array<{ name: string; value: Provider; disabled?: string }> = [
  { name: 'Amazon Web Services (Cognito)', value: 'aws' },
  { name: 'Microsoft Azure (Azure AD B2C)', value: 'azure', disabled: 'coming soon' },
  { name: 'Google Cloud Platform (Identity Platform)', value: 'gcp', disabled: 'coming soon' },
];

export const AWS_REGION_LABELS: Record<AwsRegion, string> = {
  'us-east-1': 'US East (N. Virginia)',
  'us-east-2': 'US East (Ohio)',
  'us-west-1': 'US West (N. California)',
  'us-west-2': 'US West (Oregon)',
  'ap-south-1': 'Asia Pacific (Mumbai)',
  'ap-southeast-1': 'Asia Pacific (Singapore)',
  'ap-southeast-2': 'Asia Pacific (Sydney)',
  'ap-northeast-1': 'Asia Pacific (Tokyo)',
  'ap-northeast-2': 'Asia Pacific (Seoul)',
  'eu-west-1': 'Europe (Ireland)',
  'eu-west-2': 'Europe (London)',
  'eu-central-1': 'Europe (Frankfurt)',
  'eu-north-1': 'Europe (Stockholm)',
  'ca-central-1': 'Canada (Central)',
  'sa-east-1': 'South America (Sao Paulo)',
  'me-south-1': 'Middle East (Bahrain)',
  'af-south-1': 'Africa (Cape Town)',
};

export const AWS_REGION_VALUES = Object.keys(AWS_REGION_LABELS) as AwsRegion[];

export const AWS_REGION_CHOICES: Array<{ name: string; value: AwsRegion }> = AWS_REGION_VALUES.map(
  (value) => ({
    name: `${AWS_REGION_LABELS[value]} (${value})`,
    value,
  }),
);

export const SIGNIN_OPTION_CHOICES: Array<{ name: string; value: SignInOption }> = [
  { name: 'Email address — users sign in with their email address', value: 'email' },
  { name: 'Phone number — users sign in with their phone (SMS OTP)', value: 'phone' },
  { name: 'Username — users choose a unique username', value: 'username' },
];

export const MFA_MODE_CHOICES: Array<{ name: string; value: MfaMode }> = [
  { name: 'Disabled — no MFA, users sign in with password only', value: 'off' },
  { name: 'Optional — users may opt into MFA but are not required to', value: 'optional' },
  { name: 'Required — all users must set up MFA before signing in', value: 'required' },
];

export const MFA_METHOD_CHOICES: Array<{ name: string; value: MfaMethod }> = [
  { name: 'Authenticator App (TOTP)', value: 'totp' },
  { name: 'SMS Text Message', value: 'sms' },
];

export const AUTH_FLOW_CHOICES: Array<{ name: string; value: AuthFlow }> = [
  { name: 'SRP Auth (recommended)', value: 'ALLOW_USER_SRP_AUTH' },
  { name: 'User/Password Auth', value: 'ALLOW_USER_PASSWORD_AUTH' },
  { name: 'Custom Auth (Lambda)', value: 'ALLOW_CUSTOM_AUTH' },
  { name: 'Admin Password Auth', value: 'ALLOW_ADMIN_USER_PASSWORD_AUTH' },
];

export const REFRESH_TOKEN_AUTH_FLOW: AuthFlow = 'ALLOW_REFRESH_TOKEN_AUTH';

export const LAMBDA_TRIGGER_FIELDS: Array<{
  key: keyof import('../types').LambdaTriggers;
  label: string;
}> = [
  { key: 'preSignUp', label: 'Pre Sign-up' },
  { key: 'postConfirmation', label: 'Post Confirmation' },
  { key: 'preAuthentication', label: 'Pre Authentication' },
  { key: 'postAuthentication', label: 'Post Authentication' },
  { key: 'customMessage', label: 'Custom Message' },
  { key: 'preTokenGeneration', label: 'Pre Token Generation' },
  { key: 'userMigration', label: 'User Migration' },
  { key: 'defineChallenge', label: 'Define Auth Challenge' },
  { key: 'createChallenge', label: 'Create Auth Challenge' },
  { key: 'verifyChallenge', label: 'Verify Auth Challenge' },
];

export const POOL_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

// Cognito's own ClientName constraint is much looser (letters, numbers, spaces, + = , . @ -),
// which would still accept symbol-only garbage like "@@@@". Restricted here to the same
// character set as the pool name, so it actually rejects that.
export const APP_CLIENT_NAME_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export const LAMBDA_ARN_REGEX = /^arn:aws:lambda:[a-z0-9-]+:\d{12}:function:[a-zA-Z0-9-_]+$/;

export const CUSTOM_ATTRIBUTE_TYPE_CHOICES: Array<{ name: string; value: CustomAttributeType }> = [
  { name: 'String', value: 'String' },
  { name: 'Number', value: 'Number' },
  { name: 'Boolean', value: 'Boolean' },
  { name: 'DateTime', value: 'DateTime' },
];

// Cognito custom attribute names are limited to 20 characters (the "custom:" prefix is added
// automatically and doesn't count against this limit).
export const CUSTOM_ATTRIBUTE_NAME_REGEX = /^[a-zA-Z0-9_]{1,20}$/;

// Attributes auth-cli already declares as standard Schema entries; custom attributes can't reuse them.
export const RESERVED_ATTRIBUTE_NAMES = ['email', 'name'];
