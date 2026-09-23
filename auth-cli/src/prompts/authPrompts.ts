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
  TOKEN_VALIDITY_LIMITS,
} from '../config/constants';
import {
  filterNumberInRange,
  validateAppClientName,
  validateAtLeastOne,
  validateCustomAttributeName,
  validatePoolName,
  validateRange,
  validateUrl,
} from '../validators/configValidator';
import { AppClient, AuthConfig, CustomAttribute, LambdaTriggers, MfaMethod } from '../types';
import { logger } from '../utils/logger';
import { filterYesNo, transformYesNo, validateYesNo } from './yesNoQuestion';

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
      type: 'input',
      name: 'selfSignup',
      message:
        'Allow self-registration? (users can sign themselves up; disable to require an admin to create accounts) (y/n)',
      filter: filterYesNo,
      validate: validateYesNo,
      transformer: transformYesNo,
    },
    {
      type: 'input',
      name: 'emailVerification',
      message:
        'Auto-verify email addresses? (users must click a confirmation link/code before they can sign in) (y/n)',
      filter: filterYesNo,
      validate: validateYesNo,
      transformer: transformYesNo,
    },
    {
      type: 'input',
      name: 'deletionProtection',
      message:
        'Enable deletion protection? (recommended for prod, disable for easy teardown in dev) (y/n)',
      filter: filterYesNo,
      validate: validateYesNo,
      transformer: transformYesNo,
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
      type: 'input',
      name: 'minLength',
      message: 'Minimum password length (6-20):',
      default: '8',
      filter: filterNumberInRange(6, 20),
      validate: validateRange(6, 20, 'Minimum length'),
    },
    {
      type: 'input',
      name: 'requireUppercase',
      message: 'Require uppercase letters (A-Z)? (y/n)',
      filter: filterYesNo,
      validate: validateYesNo,
      transformer: transformYesNo,
    },
    {
      type: 'input',
      name: 'requireLowercase',
      message: 'Require lowercase letters (a-z)? (y/n)',
      filter: filterYesNo,
      validate: validateYesNo,
      transformer: transformYesNo,
    },
    {
      type: 'input',
      name: 'requireNumbers',
      message: 'Require numbers (0-9)? (y/n)',
      filter: filterYesNo,
      validate: validateYesNo,
      transformer: transformYesNo,
    },
    {
      type: 'input',
      name: 'requireSymbols',
      message: 'Require special characters (!@#$...)? (y/n)',
      filter: filterYesNo,
      validate: validateYesNo,
      transformer: transformYesNo,
    },
    {
      type: 'input',
      name: 'tempPasswordDays',
      message: 'Temporary password validity (days, 1-365):',
      default: '7',
      filter: filterNumberInRange(1, 365),
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
    const { method } = await inquirer.prompt<{ method: MfaMethod }>([
      {
        type: 'list',
        name: 'method',
        message: 'MFA Method:',
        choices: MFA_METHOD_CHOICES,
        default: 'totp',
      },
    ]);
    methods = [method];
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
      type: 'input',
      name: 'addAttribute',
      message: 'Add custom user attributes? (e.g. role, department) (y/n)',
      filter: filterYesNo,
      validate: validateYesNo,
      transformer: transformYesNo,
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
        type: 'input',
        name: 'mutable',
        message: 'Mutable (can be changed after sign-up)? (y/n)',
        filter: filterYesNo,
        validate: validateYesNo,
        transformer: transformYesNo,
      },
    ]);

    let constraints: Partial<CustomAttribute> = {};
    if (base.type === 'String') {
      constraints = await inquirer.prompt<{ minLength: number; maxLength: number }>([
        {
          type: 'input',
          name: 'minLength',
          message: 'Minimum length:',
          default: '0',
          filter: filterNumberInRange(0, 2048),
          validate: validateRange(0, 2048, 'Minimum length'),
        },
        {
          type: 'input',
          name: 'maxLength',
          message: 'Maximum length:',
          default: '256',
          filter: filterNumberInRange(1, 2048),
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

    // Cognito rejects `Required: true` for any custom attribute (only built-in attributes like
    // `email` support that), so this is never a legitimate choice — always false.
    attributes.push({ ...base, name: base.name.trim(), required: false, ...constraints });

    const { addAnother } = await inquirer.prompt<{ addAnother: boolean }>([
      {
        type: 'input',
        name: 'addAnother',
        message: 'Add another custom attribute? (y/n)',
        filter: filterYesNo,
        validate: validateYesNo,
        transformer: transformYesNo,
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

  const { accessToken, idToken, refreshToken } = TOKEN_VALIDITY_LIMITS;

  for (let index = clients.length; ; index++) {
    logger.info(`\nApp Client ${index + 1}`);

    const base = await inquirer.prompt<{
      name: string;
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
        validate: validateAppClientName,
      },
      {
        type: 'checkbox',
        name: 'authFlows',
        message: 'Auth flows (Refresh Token is always included):',
        choices: AUTH_FLOW_CHOICES,
        default: ['ALLOW_USER_SRP_AUTH'],
      },
      {
        type: 'input',
        name: 'accessTokenValidity',
        message: `Access token validity (minutes, ${accessToken.min}-${accessToken.max}):`,
        default: '60',
        filter: filterNumberInRange(accessToken.min, accessToken.max),
        validate: validateRange(accessToken.min, accessToken.max, 'Access token validity'),
      },
      {
        type: 'input',
        name: 'idTokenValidity',
        message: `ID token validity (minutes, ${idToken.min}-${idToken.max}):`,
        default: '60',
        filter: filterNumberInRange(idToken.min, idToken.max),
        validate: validateRange(idToken.min, idToken.max, 'ID token validity'),
      },
      {
        type: 'input',
        name: 'refreshTokenValidity',
        message: `Refresh token validity (days, ${refreshToken.min}-${refreshToken.max}):`,
        default: '30',
        filter: filterNumberInRange(refreshToken.min, refreshToken.max),
        validate: validateRange(refreshToken.min, refreshToken.max, 'Refresh token validity'),
      },
    ]);

    const callbackUrls = await collectUrlList('Callback URL');
    const logoutUrls = await collectUrlList('Logout URL');

    const authFlows = base.authFlows.includes(REFRESH_TOKEN_AUTH_FLOW)
      ? base.authFlows
      : [...base.authFlows, REFRESH_TOKEN_AUTH_FLOW];

    clients.push({
      name: base.name,
      generateSecret: true,
      authFlows,
      accessTokenValidity: base.accessTokenValidity,
      idTokenValidity: base.idTokenValidity,
      refreshTokenValidity: base.refreshTokenValidity,
      callbackUrls,
      logoutUrls,
    });

    const { addAnother } = await inquirer.prompt<{ addAnother: boolean }>([
      {
        type: 'input',
        name: 'addAnother',
        message: 'Add another app client? (y/n)',
        filter: filterYesNo,
        validate: validateYesNo,
        transformer: transformYesNo,
      },
    ]);

    if (!addAnother) {
      break;
    }
  }

  return clients;
}

const MAX_URLS_PER_LIST = 5;

async function collectUrlList(label: string): Promise<string[]> {
  const urls: string[] = [];

  while (urls.length < MAX_URLS_PER_LIST) {
    const { url } = await inquirer.prompt<{ url: string }>([
      {
        type: 'input',
        name: 'url',
        message: `${label} ${urls.length + 1}/${MAX_URLS_PER_LIST} (press Enter with nothing typed to stop adding more):`,
        validate: (value: string): true | string => {
          const result = validateUrl(value);
          if (result !== true) {
            return result;
          }
          if (value.trim().length > 0 && urls.includes(value.trim())) {
            return `${value.trim()} was already added`;
          }
          return true;
        },
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
