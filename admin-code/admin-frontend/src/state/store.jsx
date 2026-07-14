import { createContext, useContext } from 'react'

/* ------------------------------------------------------------------
   Central configuration model for a Cognito provisioning request.
   This is the single source of truth that the CloudFormation
   generator (lib/cloudformation.js) consumes.
------------------------------------------------------------------ */

export function makeAppClient(index = 1) {
  return {
    id: cryptoId(),
    clientName: `app-client-${index}`,
    generateSecret: false,
    // token validity
    accessTokenValidity: 60,
    accessTokenUnit: 'minutes',
    idTokenValidity: 60,
    idTokenUnit: 'minutes',
    refreshTokenValidity: 30,
    refreshTokenUnit: 'days',
    authSessionValidity: 3, // minutes
    // auth flows
    explicitAuthFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
    // OAuth / hosted UI
    allowedOAuthFlowsUserPoolClient: false,
    allowedOAuthFlows: [],
    allowedOAuthScopes: ['openid', 'email'],
    callbackURLs: [],
    logoutURLs: [],
    defaultRedirectURI: '',
    supportedIdentityProviders: ['COGNITO'],
    // behavior
    preventUserExistenceErrors: 'ENABLED',
    enableTokenRevocation: true,
    enablePropagateAdditionalUserContextData: false,
    readAttributes: [],
    writeAttributes: [],
  }
}

function cryptoId() {
  // non-crypto unique id; Math.random is fine in the browser runtime
  return 'c_' + Math.random().toString(36).slice(2, 9)
}

export const ORG_NAME_MAX = 32
export const UNIQUE_ID_LENGTH = 8

export const AWS_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ca-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'eu-north-1',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'sa-east-1',
]

// 8-character lowercase alphanumeric id used to keep resource names unique.
export function makeUniqueId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < UNIQUE_ID_LENGTH; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

export const STANDARD_ATTRIBUTES = [
  'email',
  'phone_number',
  'given_name',
  'family_name',
  'name',
  'nickname',
  'preferred_username',
  'profile',
  'picture',
  'website',
  'gender',
  'birthdate',
  'zoneinfo',
  'locale',
  'address',
  'updated_at',
]

// Message types you can supply a custom HTML template for (sent by your backend).
export const MESSAGE_TEMPLATES = [
  { key: 'verification', label: 'Email verification', subject: 'Verify your email' },
  { key: 'invitation', label: 'Admin invitation', subject: 'You have been invited' },
  { key: 'mfa', label: 'MFA code', subject: 'Your authentication code' },
  { key: 'forgotPassword', label: 'Forgot password', subject: 'Reset your password' },
  { key: 'passwordChanged', label: 'Password changed', subject: 'Your password was changed' },
]

export const LAMBDA_TRIGGERS = [
  ['preSignUp', 'Pre sign-up'],
  ['preAuthentication', 'Pre authentication'],
  ['postAuthentication', 'Post authentication'],
  ['postConfirmation', 'Post confirmation'],
  ['preTokenGeneration', 'Pre token generation'],
  ['customMessage', 'Custom message'],
  ['defineAuthChallenge', 'Define auth challenge'],
  ['createAuthChallenge', 'Create auth challenge'],
  ['verifyAuthChallengeResponse', 'Verify auth challenge response'],
  ['userMigration', 'User migration'],
]

export const initialState = {
  organization: '',
  region: 'us-east-1',
  uniqueId: '',
  userPool: {
    poolName: '',
    deletionProtection: true,

    // sign-in experience
    usernameAttributes: ['email'], // email | phone_number
    aliasAttributes: [], // preferred_username | email | phone_number
    usernameCaseSensitive: false,
    autoVerifiedAttributes: ['email'],

    // password policy
    passwordMinimumLength: 8,
    passwordRequireUppercase: true,
    passwordRequireLowercase: true,
    passwordRequireNumbers: true,
    passwordRequireSymbols: true,
    temporaryPasswordValidityDays: 7,

    // sign-up
    allowAdminCreateUserOnly: false,

    // MFA
    mfaConfiguration: 'OFF', // OFF | ON | OPTIONAL
    mfaSms: false,
    mfaTotp: true,

    // attributes
    requiredAttributes: ['email'],
    customAttributes: [], // {name, type, mutable, min, max}

    // recovery (ordered priority)
    accountRecovery: ['verified_email'], // verified_email | verified_phone_number

    // delivery strategy
    deliveryMode: 'cognito', // cognito | custom (backend sender, suppresses Cognito sending)

    // email
    emailSendingAccount: 'COGNITO_DEFAULT', // COGNITO_DEFAULT | DEVELOPER
    emailFrom: '',
    emailReplyTo: '',
    sesSourceArn: '',
    sesConfigurationSet: '',

    // custom backend sender (Lambda) — used when deliveryMode === 'custom'
    takeOverEmail: true,
    takeOverSms: false,
    customEmailSenderArn: '',
    customSmsSenderArn: '',
    senderKmsKeyArn: '',
    sesFromDomain: '',
    sesFromAddress: '',
    htmlTemplates: {}, // { [key]: { fileName, subject, html } }

    // SMS
    smsEnabled: false,
    smsExternalId: '',
    smsSnsCallerArn: '',
    smsSnsRegion: '',

    // verification messages
    verificationMessageType: 'CODE', // CODE | LINK
    emailVerificationSubject: 'Verify your email',
    emailVerificationMessage: 'Your verification code is {####}',
    smsVerificationMessage: 'Your verification code is {####}',

    // admin-create invite messages
    inviteEmailSubject: 'Your temporary password',
    inviteEmailMessage:
      'Your username is {username} and temporary password is {####}',
    inviteSmsMessage: 'Your username is {username} and password is {####}',

    // device tracking
    deviceTracking: 'OFF', // OFF | OPTIONAL | ALWAYS  (maps to challenge flags)

    // advanced security
    advancedSecurityMode: 'OFF', // OFF | AUDIT | ENFORCED

    // lambda triggers (arn strings, keyed by trigger name)
    lambdaTriggers: {},

    // tags
    tags: [], // {key, value}
  },
  appClients: [makeAppClient(1)],
  domain: {
    enabled: false,
    type: 'cognito', // cognito | custom
    domainPrefix: '',
    customDomain: '',
    certificateArn: '',
  },
}

export function reducer(state, action) {
  switch (action.type) {
    case 'SET_ORG':
      return { ...state, organization: action.value }
    case 'SET_REGION':
      return { ...state, region: action.value }
    case 'SET_UNIQUE_ID':
      return { ...state, uniqueId: action.value }
    case 'SET_IDENTITY':
      return { ...state, ...action.patch }
    case 'SET_POOL':
      return { ...state, userPool: { ...state.userPool, ...action.patch } }
    case 'SET_DOMAIN':
      return { ...state, domain: { ...state.domain, ...action.patch } }
    case 'ADD_CLIENT':
      return {
        ...state,
        appClients: [
          ...state.appClients,
          makeAppClient(state.appClients.length + 1),
        ],
      }
    case 'UPDATE_CLIENT':
      return {
        ...state,
        appClients: state.appClients.map((c) =>
          c.id === action.id ? { ...c, ...action.patch } : c
        ),
      }
    case 'REMOVE_CLIENT':
      return {
        ...state,
        appClients: state.appClients.filter((c) => c.id !== action.id),
      }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

export const StoreContext = createContext(null)

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
