import { z } from 'zod';
import {
  AWS_REGION_VALUES,
  CUSTOM_ATTRIBUTE_NAME_REGEX,
  LAMBDA_ARN_REGEX,
  POOL_NAME_REGEX,
  REFRESH_TOKEN_AUTH_FLOW,
  RESERVED_ATTRIBUTE_NAMES,
  TOKEN_VALIDITY_LIMITS,
} from '../config/constants';

const { accessToken, idToken, refreshToken } = TOKEN_VALIDITY_LIMITS;

const PasswordPolicySchema = z.object({
  minLength: z
    .number()
    .int()
    .min(6, 'Minimum length must be at least 6')
    .max(20, 'Minimum length must be at most 20')
    .default(8),
  requireUppercase: z.boolean().default(true),
  requireLowercase: z.boolean().default(true),
  requireNumbers: z.boolean().default(true),
  requireSymbols: z.boolean().default(false),
  tempPasswordDays: z
    .number()
    .int()
    .min(1, 'Temporary password validity must be at least 1 day')
    .max(365, 'Temporary password validity must be at most 365 days')
    .default(7),
});

const MfaSchema = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(['off', 'optional', 'required']),
    methods: z.array(z.enum(['totp', 'sms'])),
  })
  .refine((mfa) => !mfa.enabled || mfa.methods.length > 0, {
    message: 'At least one MFA method must be selected when MFA is enabled',
    path: ['methods'],
  });

const lambdaArn = (): z.ZodEffects<z.ZodString, string, string> =>
  z.string().refine((value) => value.trim().length === 0 || LAMBDA_ARN_REGEX.test(value.trim()), {
    message: 'Must be a valid Lambda ARN (arn:aws:lambda:REGION:ACCOUNT:function:NAME) or empty',
  });

const AppClientSchema = z
  .object({
    name: z.string().min(1, 'Client name is required'),
    generateSecret: z.boolean(),
    authFlows: z.array(
      z.enum([
        'ALLOW_USER_SRP_AUTH',
        'ALLOW_USER_PASSWORD_AUTH',
        'ALLOW_CUSTOM_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH',
        'ALLOW_ADMIN_USER_PASSWORD_AUTH',
      ]),
    ),
    accessTokenValidity: z
      .number()
      .int()
      .min(accessToken.min, `Access token validity must be at least ${accessToken.min} minutes`)
      .max(accessToken.max, `Access token validity must be at most ${accessToken.max} minutes`),
    idTokenValidity: z
      .number()
      .int()
      .min(idToken.min, `ID token validity must be at least ${idToken.min} minutes`)
      .max(idToken.max, `ID token validity must be at most ${idToken.max} minutes`),
    refreshTokenValidity: z
      .number()
      .int()
      .min(refreshToken.min, `Refresh token validity must be at least ${refreshToken.min} day`)
      .max(refreshToken.max, `Refresh token validity must be at most ${refreshToken.max} days`),
    callbackUrls: z.array(z.string().url('Each callback URL must be a valid URL')),
    logoutUrls: z.array(z.string().url('Each logout URL must be a valid URL')),
  })
  .refine((client) => client.authFlows.includes(REFRESH_TOKEN_AUTH_FLOW), {
    message: 'App client auth flows must include ALLOW_REFRESH_TOKEN_AUTH',
    path: ['authFlows'],
  });

const CustomAttributeSchema = z.object({
  name: z
    .string()
    .regex(
      CUSTOM_ATTRIBUTE_NAME_REGEX,
      'Attribute name must be 1-20 characters: letters, numbers, and underscores only',
    )
    .refine((n) => !RESERVED_ATTRIBUTE_NAMES.includes(n), {
      message: 'email and name are already built-in attributes; choose a different name',
    }),
  type: z.enum(['String', 'Number', 'Boolean', 'DateTime']),
  // Cognito rejects `Required: true` for any custom attribute at deploy time — only built-in
  // attributes like `email` support that — so this is caught here instead.
  required: z.literal(false, {
    errorMap: () => ({ message: 'Custom attributes cannot be required (Cognito limitation)' }),
  }),
  mutable: z.boolean(),
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(1).optional(),
  minValue: z.number().int().optional(),
  maxValue: z.number().int().optional(),
});

const LambdaTriggersSchema = z.object({
  preSignUp: lambdaArn(),
  postConfirmation: lambdaArn(),
  preAuthentication: lambdaArn(),
  postAuthentication: lambdaArn(),
  customMessage: lambdaArn(),
  preTokenGeneration: lambdaArn(),
  userMigration: lambdaArn(),
  defineChallenge: lambdaArn(),
  createChallenge: lambdaArn(),
  verifyChallenge: lambdaArn(),
});

export const AuthConfigSchema = z
  .object({
    provider: z.enum(['aws', 'azure', 'gcp'], {
      errorMap: () => ({ message: 'Provider must be one of: aws, azure, gcp' }),
    }),

    region: z.enum(AWS_REGION_VALUES as [string, ...string[]], {
      errorMap: () => ({ message: `Region must be one of: ${AWS_REGION_VALUES.join(', ')}` }),
    }),

    poolName: z
      .string()
      .min(1, 'User pool name is required')
      .regex(
        POOL_NAME_REGEX,
        'User pool name must contain only letters, numbers, hyphens, and underscores',
      ),

    selfSignup: z.boolean(),
    emailVerification: z.boolean(),
    deletionProtection: z.boolean(),

    signInOptions: z
      .array(z.enum(['email', 'phone', 'username']))
      .min(1, 'At least one sign-in option must be selected'),

    passwordPolicy: PasswordPolicySchema,
    mfa: MfaSchema,

    appClients: z.array(AppClientSchema).min(1, 'At least one app client is required'),

    lambdaTriggers: LambdaTriggersSchema,

    customAttributes: z.array(CustomAttributeSchema),
  })
  .refine((config) => config.provider === 'aws', {
    message: 'Only the "aws" provider is currently supported (azure and gcp are coming soon)',
    path: ['provider'],
  });

export type AuthConfigInput = z.input<typeof AuthConfigSchema>;
export type AuthConfigOutput = z.output<typeof AuthConfigSchema>;
