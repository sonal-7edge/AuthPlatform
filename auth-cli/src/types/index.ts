export type Provider = 'aws' | 'azure' | 'gcp';

export type AwsRegion =
  | 'us-east-1'
  | 'us-east-2'
  | 'us-west-1'
  | 'us-west-2'
  | 'ap-south-1'
  | 'ap-southeast-1'
  | 'ap-southeast-2'
  | 'ap-northeast-1'
  | 'ap-northeast-2'
  | 'eu-west-1'
  | 'eu-west-2'
  | 'eu-central-1'
  | 'eu-north-1'
  | 'ca-central-1'
  | 'sa-east-1'
  | 'me-south-1'
  | 'af-south-1';

export type SignInOption = 'email' | 'phone' | 'username';

export type MfaMode = 'off' | 'optional' | 'required';

export type MfaMethod = 'totp' | 'sms';

export type AuthFlow =
  | 'ALLOW_USER_SRP_AUTH'
  | 'ALLOW_USER_PASSWORD_AUTH'
  | 'ALLOW_CUSTOM_AUTH'
  | 'ALLOW_REFRESH_TOKEN_AUTH'
  | 'ALLOW_ADMIN_USER_PASSWORD_AUTH';

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
  tempPasswordDays: number;
}

export interface MfaConfig {
  enabled: boolean;
  mode: MfaMode;
  methods: MfaMethod[];
}

export interface AppClient {
  name: string;
  generateSecret: boolean;
  authFlows: AuthFlow[];
  accessTokenValidity: number;
  idTokenValidity: number;
  refreshTokenValidity: number;
  callbackUrls: string[];
  logoutUrls: string[];
}

export type CustomAttributeType = 'String' | 'Number' | 'Boolean' | 'DateTime';

export interface CustomAttribute {
  name: string;
  type: CustomAttributeType;
  required: boolean;
  mutable: boolean;
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
}

export interface LambdaTriggers {
  preSignUp: string;
  postConfirmation: string;
  preAuthentication: string;
  postAuthentication: string;
  customMessage: string;
  preTokenGeneration: string;
  userMigration: string;
  defineChallenge: string;
  createChallenge: string;
  verifyChallenge: string;
}

export interface AuthConfig {
  provider: Provider;
  region: AwsRegion;
  poolName: string;
  selfSignup: boolean;
  emailVerification: boolean;
  deletionProtection: boolean;
  signInOptions: SignInOption[];
  passwordPolicy: PasswordPolicy;
  mfa: MfaConfig;
  appClients: AppClient[];
  lambdaTriggers: LambdaTriggers;
  customAttributes: CustomAttribute[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
