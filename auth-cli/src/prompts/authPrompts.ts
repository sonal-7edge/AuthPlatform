import inquirer from 'inquirer';
import {
  AUTH_FLOW_CHOICES,
  AWS_REGION_CHOICES,
  CUSTOM_ATTRIBUTE_TYPE_CHOICES,
  LAMBDA_TRIGGER_FIELDS,
  MFA_METHOD_CHOICES,
  MFA_MODE_CHOICES,
  PROVIDER_CHOICES,
  REFRESH_TOKEN_AUTH_FLOW,
  SIGNIN_OPTION_CHOICES,
} from '../config/constants';
import {
  validateAtLeastOne,
  validateCustomAttributeName,
  validatePoolName,
  validateRange,
  validateUrl,
} from '../validators/configValidator';
import {
  AppClient,
  AuthConfig,
  CustomAttribute,
  LambdaTriggers,
  MfaMethod,
} from '../types';
import { logger } from '../utils/logger';

export async function runAuthPrompts(): Promise<AuthConfig> {
  // Step 1 — Cloud Provider
  const { provider } = await inquirer.prompt<{ provider: 'aws' }>([
    {
      type: 'list',
      name: 'provider',
      message: 'Cloud Provider:',
      choices: PROVIDER_CHOICES,
      default: 'aws',
    },
  ]);

  const { region } = await inquirer.prompt<{ region: AuthConfig['region'] }>([
    {
      type: 'list',
      name: 'region',
      message: 'AWS Region:',
      choices: AWS_REGION_CHOICES,
      default: 'us-east-1',
    },
  ]);

  // Step 2 — User Pool
  const pool = await inquirer.prompt<{
    poolName: string;
    selfSignup: boolean;
    emailVerification: boolean;
    deletionProtection: boolean;
  }>([
    {
      type: 'input',
      name: 'poolName',
      message: 'User Pool Name:',
      validate: validatePoolName,
    },
    {
      type: 'confirm',
      name: 'selfSignup',
      message:
        'Allow self-registration? (users can sign themselves up; disable to require an admin to create accounts)',
      default: true,
    },
    {
      type: 'confirm',
      name: 'emailVerification',
      message:
        'Auto-verify email addresses? (users must click a confirmation link/code before they can sign in)',
      default: true,
    },
    {
      type: 'confirm',
      name: 'deletionProtection',
      message:
        'Enable deletion protection? (recommended for prod, disable for easy teardown in dev)',
      default: true,
    },
  ]);

  // Step 3 — Sign-in
  const { signInOptions } = await inquirer.prompt<{ signInOptions: AuthConfig['signInOptions'] }>([
    {
      type: 'checkbox',
      name: 'signInOptions',
      message:
        'How will users sign in? (cannot be changed after the user pool is created; use space to select)',
      choices: SIGNIN_OPTION_CHOICES,
      default: ['email'],
      validate: validateAtLeastOne('Select at least one sign-in option'),
    },
  ]);

  // Step 4 — Password Policy
  const passwordPolicy = await inquirer.prompt<AuthConfig['passwordPolicy']>([
    {
      type: 'number',
      name: 'minLength',
      message: 'Minimum password length (6-20):',
      default: 8,
      validate: validateRange(6, 20, 'Minimum length'),
    },
    {
      type: 'confirm',
      name: 'requireUppercase',
      message: 'Require uppercase letters (A-Z)?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'requireLowercase',
      message: 'Require lowercase letters (a-z)?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'requireNumbers',
      message: 'Require numbers (0-9)?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'requireSymbols',
      message: 'Require special characters (!@#$...)?',
      default: false,
    },
    {
      type: 'number',
      name: 'tempPasswordDays',
      message: 'Temporary password validity (days, 1-365):',
      default: 7,
      validate: validateRange(1, 365, 'Temporary password validity'),
    },
  ]);

  // Step 5 — MFA
  const { mode } = await inquirer.prompt<{ mode: AuthConfig['mfa']['mode'] }>([
    {
      type: 'list',
      name: 'mode',
      message: 'MFA Enforcement:',
      choices: MFA_MODE_CHOICES,
      default: 'off',
    },
  ]);

  let methods: MfaMethod[] = [];
  if (mode !== 'off') {
    const methodsAnswer = await inquirer.prompt<{ methods: MfaMethod[] }>([
      {
        type: 'checkbox',
        name: 'methods',
        message: 'Allowed MFA Methods:',
        choices: MFA_METHOD_CHOICES,
        default: ['totp'],
        validate: validateAtLeastOne('Select at least one MFA method'),
      },
    ]);
    methods = methodsAnswer.methods;
  }

  // Step 6 — Custom User Attributes (optional, repeatable)
  const customAttributes = await collectCustomAttributes();

  // Step 7 — App Clients (repeatable)
  const appClients = await collectAppClients();

  // Step 8 — Lambda Triggers
  const lambdaTriggers = await collectLambdaTriggers();

  return {
    provider,
    region,
    poolName: pool.poolName,
    selfSignup: pool.selfSignup,
    emailVerification: pool.emailVerification,
    deletionProtection: pool.deletionProtection,
    signInOptions,
    passwordPolicy,
    mfa: {
      enabled: mode !== 'off',
      mode,
      methods,
    },
    customAttributes,
    appClients,
    lambdaTriggers,
  };
}

async function collectCustomAttributes(): Promise<CustomAttribute[]> {
  const { addAttribute } = await inquirer.prompt<{ addAttribute: boolean }>([
    {
      type: 'confirm',
      name: 'addAttribute',
      message: 'Add custom user attributes? (e.g. role, department)',
      default: false,
    },
  ]);

  if (!addAttribute) {
    return [];
  }

  const attributes: CustomAttribute[] = [];

  for (let index = 0; ; index++) {
    logger.info(`\nCustom Attribute ${index + 1}`);

    const base = await inquirer.prompt<{
      name: string;
      type: CustomAttribute['type'];
      required: boolean;
      mutable: boolean;
    }>([
      {
        type: 'input',
        name: 'name',
        message: 'Attribute name:',
        validate: validateCustomAttributeName,
      },
      {
        type: 'list',
        name: 'type',
        message: 'Attribute type:',
        choices: CUSTOM_ATTRIBUTE_TYPE_CHOICES,
        default: 'String',
      },
      {
        type: 'confirm',
        name: 'required',
        message: 'Required at sign-up?',
        default: false,
      },
      {
        type: 'confirm',
        name: 'mutable',
        message: 'Mutable (can be changed after sign-up)?',
        default: true,
      },
    ]);

    let constraints: Partial<CustomAttribute> = {};
    if (base.type === 'String') {
      constraints = await inquirer.prompt<{ minLength: number; maxLength: number }>([
        {
          type: 'number',
          name: 'minLength',
          message: 'Minimum length:',
          default: 0,
          validate: validateRange(0, 2048, 'Minimum length'),
        },
        {
          type: 'number',
          name: 'maxLength',
          message: 'Maximum length:',
          default: 256,
          validate: validateRange(1, 2048, 'Maximum length'),
        },
      ]);
    } else if (base.type === 'Number') {
      constraints = await inquirer.prompt<{ minValue: number; maxValue: number }>([
        {
          type: 'number',
          name: 'minValue',
          message: 'Minimum value:',
          default: 0,
        },
        {
          type: 'number',
          name: 'maxValue',
          message: 'Maximum value:',
          default: 9999999,
        },
      ]);
    }

    attributes.push({ ...base, name: base.name.trim(), ...constraints });

    const { addAnother } = await inquirer.prompt<{ addAnother: boolean }>([
      {
        type: 'confirm',
        name: 'addAnother',
        message: 'Add another custom attribute?',
        default: false,
      },
    ]);

    if (!addAnother) {
      break;
    }
  }

  return attributes;
}

export async function collectAppClients(existing: AppClient[] = []): Promise<AppClient[]> {
  const clients: AppClient[] = [...existing];

  for (let index = clients.length; ; index++) {
    logger.info(`\nApp Client ${index + 1}`);

    const base = await inquirer.prompt<{
      name: string;
      generateSecret: boolean;
      authFlows: AppClient['authFlows'];
      accessTokenValidity: number;
      idTokenValidity: number;
      refreshTokenValidity: number;
    }>([
      {
        type: 'input',
        name: 'name',
        message: 'Client name:',
        default: index === 0 ? 'web-client' : `client-${index + 1}`,
        validate: (value: string) => (value.trim().length > 0 ? true : 'Client name is required'),
      },
      {
        type: 'confirm',
        name: 'generateSecret',
        message:
          'Generate client secret? (only for server-side apps that can keep it secret; leave off for SPAs/mobile)',
        default: false,
      },
      {
        type: 'checkbox',
        name: 'authFlows',
        message: 'Auth flows (Refresh Token is always included):',
        choices: AUTH_FLOW_CHOICES,
        default: ['ALLOW_USER_SRP_AUTH'],
      },
      {
        type: 'number',
        name: 'accessTokenValidity',
        message: 'Access token validity (minutes, max 1440):',
        default: 60,
        validate: validateRange(1, 1440, 'Access token validity'),
      },
      {
        type: 'number',
        name: 'idTokenValidity',
        message: 'ID token validity (minutes, max 1440):',
        default: 60,
        validate: validateRange(1, 1440, 'ID token validity'),
      },
      {
        type: 'number',
        name: 'refreshTokenValidity',
        message: 'Refresh token validity (days, max 3650):',
        default: 30,
        validate: validateRange(1, 3650, 'Refresh token validity'),
      },
    ]);

    const callbackUrls = await collectUrlList('Callback URL');
    const logoutUrls = await collectUrlList('Logout URL');

    const authFlows = base.authFlows.includes(REFRESH_TOKEN_AUTH_FLOW)
      ? base.authFlows
      : [...base.authFlows, REFRESH_TOKEN_AUTH_FLOW];

    clients.push({
      name: base.name,
      generateSecret: base.generateSecret,
      authFlows,
      accessTokenValidity: base.accessTokenValidity,
      idTokenValidity: base.idTokenValidity,
      refreshTokenValidity: base.refreshTokenValidity,
      callbackUrls,
      logoutUrls,
    });

    const { addAnother } = await inquirer.prompt<{ addAnother: boolean }>([
      {
        type: 'confirm',
        name: 'addAnother',
        message: 'Add another app client?',
        default: false,
      },
    ]);

    if (!addAnother) {
      break;
    }
  }

  return clients;
}

async function collectUrlList(label: string): Promise<string[]> {
  const urls: string[] = [];

  for (;;) {
    const { url } = await inquirer.prompt<{ url: string }>([
      {
        type: 'input',
        name: 'url',
        message: `${label} (leave blank to finish):`,
        validate: validateUrl,
      },
    ]);

    if (!url || url.trim().length === 0) {
      break;
    }
    urls.push(url.trim());
  }

  return urls;
}

async function collectLambdaTriggers(): Promise<LambdaTriggers> {
  const answers = await inquirer.prompt<LambdaTriggers>(
    LAMBDA_TRIGGER_FIELDS.map(({ key, label }) => ({
      type: 'input',
      name: key,
      message: `${label} ARN (optional):`,
      default: '',
    })),
  );

  return answers;
}
