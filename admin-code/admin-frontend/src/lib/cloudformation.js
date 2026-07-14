import { toYaml } from './yaml.js'

/* ------------------------------------------------------------------
   Maps the app's configuration model to an AWS CloudFormation
   template covering:
     - AWS::Cognito::UserPool
     - AWS::Cognito::UserPoolClient  (one per app client => isolation)
     - AWS::Cognito::UserPoolDomain
   No Identity Pool resources are emitted.
------------------------------------------------------------------ */

// Standard attributes whose data type is not String.
const NUMBER_ATTRS = new Set(['updated_at'])

function pascal(str, fallback) {
  const cleaned = (str || '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
  return cleaned || fallback
}

// Drop undefined / empty values so the template stays clean.
function prune(obj) {
  if (Array.isArray(obj)) {
    const arr = obj.map(prune).filter((v) => v !== undefined)
    return arr
  }
  if (obj && typeof obj === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      const pv = prune(v)
      if (pv === undefined) continue
      if (Array.isArray(pv) && pv.length === 0) continue
      if (pv && typeof pv === 'object' && !Array.isArray(pv) && Object.keys(pv).length === 0)
        continue
      out[k] = pv
    }
    return out
  }
  if (obj === '' || obj === null) return undefined
  return obj
}

function buildUserPool(up, meta = {}) {
  const mfaOn = up.mfaConfiguration !== 'OFF'

  const enabledMfas = []
  if (mfaOn && up.mfaTotp) enabledMfas.push('SOFTWARE_TOKEN_MFA')
  if (mfaOn && up.mfaSms) enabledMfas.push('SMS_MFA')

  // Schema: required standard attributes + custom attributes
  const schema = []
  for (const name of up.requiredAttributes || []) {
    schema.push({
      Name: name,
      AttributeDataType: NUMBER_ATTRS.has(name) ? 'Number' : 'String',
      Required: true,
      Mutable: true,
    })
  }
  for (const c of up.customAttributes || []) {
    if (!c.name) continue
    const entry = {
      Name: c.name,
      AttributeDataType: c.type || 'String',
      Mutable: c.mutable !== false,
      Required: false,
    }
    if (c.type === 'Number' && (c.min !== '' || c.max !== '')) {
      entry.NumberAttributeConstraints = {
        MinValue: c.min !== '' && c.min != null ? String(c.min) : undefined,
        MaxValue: c.max !== '' && c.max != null ? String(c.max) : undefined,
      }
    }
    if ((!c.type || c.type === 'String') && (c.min !== '' || c.max !== '')) {
      entry.StringAttributeConstraints = {
        MinLength: c.min !== '' && c.min != null ? String(c.min) : undefined,
        MaxLength: c.max !== '' && c.max != null ? String(c.max) : undefined,
      }
    }
    schema.push(entry)
  }

  // Account recovery -> ordered priorities
  const recoveryMechanisms = (up.accountRecovery || []).map((name, i) => ({
    Name: name,
    Priority: i + 1,
  }))

  // Device configuration
  let deviceConfiguration
  if (up.deviceTracking === 'ALWAYS') {
    deviceConfiguration = {
      ChallengeRequiredOnNewDevice: true,
      DeviceOnlyRememberedOnUserPrompt: false,
    }
  } else if (up.deviceTracking === 'OPTIONAL') {
    deviceConfiguration = {
      ChallengeRequiredOnNewDevice: true,
      DeviceOnlyRememberedOnUserPrompt: true,
    }
  }

  const customEmail = up.deliveryMode === 'custom' && up.takeOverEmail
  const customSms = up.deliveryMode === 'custom' && up.takeOverSms

  // Email configuration. When a custom backend sender takes over email,
  // Cognito does not send anything, so no EmailConfiguration is emitted.
  let emailConfiguration
  if (customEmail) {
    emailConfiguration = undefined
  } else if (up.emailSendingAccount === 'DEVELOPER') {
    emailConfiguration = {
      EmailSendingAccount: 'DEVELOPER',
      From: up.emailFrom,
      ReplyToEmailAddress: up.emailReplyTo,
      SourceArn: up.sesSourceArn,
      ConfigurationSet: up.sesConfigurationSet,
    }
  } else {
    emailConfiguration = { EmailSendingAccount: 'COGNITO_DEFAULT' }
  }

  // SMS configuration. Suppressed when a custom backend sender takes over SMS.
  const smsConfiguration =
    up.smsEnabled && !customSms
      ? {
          ExternalId: up.smsExternalId,
          SnsCallerArn: up.smsSnsCallerArn,
          SnsRegion: up.smsSnsRegion,
        }
      : undefined

  // Verification message template
  const byLink = up.verificationMessageType === 'LINK'
  const verificationMessageTemplate = {
    DefaultEmailOption: byLink ? 'CONFIRM_WITH_LINK' : 'CONFIRM_WITH_CODE',
    EmailSubject: byLink ? undefined : up.emailVerificationSubject,
    EmailMessage: byLink ? undefined : up.emailVerificationMessage,
    EmailSubjectByLink: byLink ? up.emailVerificationSubject : undefined,
    EmailMessageByLink: byLink ? up.emailVerificationMessage : undefined,
    SmsMessage: up.smsVerificationMessage,
  }

  // Admin create user config
  const adminCreateUserConfig = {
    AllowAdminCreateUserOnly: up.allowAdminCreateUserOnly,
    InviteMessageTemplate: {
      EmailSubject: up.inviteEmailSubject,
      EmailMessage: up.inviteEmailMessage,
      SMSMessage: up.inviteSmsMessage,
    },
  }

  // Lambda triggers
  const triggerMap = {
    preSignUp: 'PreSignUp',
    preAuthentication: 'PreAuthentication',
    postAuthentication: 'PostAuthentication',
    postConfirmation: 'PostConfirmation',
    preTokenGeneration: 'PreTokenGeneration',
    customMessage: 'CustomMessage',
    defineAuthChallenge: 'DefineAuthChallenge',
    createAuthChallenge: 'CreateAuthChallenge',
    verifyAuthChallengeResponse: 'VerifyAuthChallengeResponse',
    userMigration: 'UserMigration',
  }
  const lambdaConfig = {}
  for (const [k, cfnKey] of Object.entries(triggerMap)) {
    const arn = up.lambdaTriggers?.[k]
    if (arn) lambdaConfig[cfnKey] = arn
  }
  // Custom backend senders (suppress Cognito's built-in delivery).
  if (customEmail && up.customEmailSenderArn) {
    lambdaConfig.CustomEmailSender = {
      LambdaArn: up.customEmailSenderArn,
      LambdaVersion: 'V1_0',
    }
  }
  if (customSms && up.customSmsSenderArn) {
    lambdaConfig.CustomSMSSender = {
      LambdaArn: up.customSmsSenderArn,
      LambdaVersion: 'V1_0',
    }
  }
  if ((customEmail || customSms) && up.senderKmsKeyArn) {
    lambdaConfig.KMSKeyID = up.senderKmsKeyArn
  }

  // Tags — auto tags for identity, then user-defined tags (user wins on conflict).
  const userPoolTags = {}
  if (meta.organization) userPoolTags.OrganizationName = meta.organization
  if (meta.uniqueId) userPoolTags.UniqueId = meta.uniqueId
  for (const t of up.tags || []) {
    if (t.key) userPoolTags[t.key] = t.value || ''
  }

  // Username vs alias attributes are mutually exclusive in Cognito.
  const useAlias = (up.aliasAttributes || []).length > 0

  const props = {
    UserPoolName: up.poolName,
    DeletionProtection: up.deletionProtection ? 'ACTIVE' : 'INACTIVE',
    UsernameAttributes: useAlias ? undefined : up.usernameAttributes,
    AliasAttributes: useAlias ? up.aliasAttributes : undefined,
    UsernameConfiguration: { CaseSensitive: up.usernameCaseSensitive },
    AutoVerifiedAttributes: up.autoVerifiedAttributes,
    Policies: {
      PasswordPolicy: {
        MinimumLength: up.passwordMinimumLength,
        RequireUppercase: up.passwordRequireUppercase,
        RequireLowercase: up.passwordRequireLowercase,
        RequireNumbers: up.passwordRequireNumbers,
        RequireSymbols: up.passwordRequireSymbols,
        TemporaryPasswordValidityDays: up.temporaryPasswordValidityDays,
      },
    },
    MfaConfiguration: up.mfaConfiguration,
    EnabledMfas: mfaOn ? enabledMfas : undefined,
    Schema: schema,
    AccountRecoverySetting: { RecoveryMechanisms: recoveryMechanisms },
    AdminCreateUserConfig: adminCreateUserConfig,
    EmailConfiguration: emailConfiguration,
    SmsConfiguration: smsConfiguration,
    VerificationMessageTemplate: verificationMessageTemplate,
    DeviceConfiguration: deviceConfiguration,
    UserPoolAddOns:
      up.advancedSecurityMode !== 'OFF'
        ? { AdvancedSecurityMode: up.advancedSecurityMode }
        : undefined,
    LambdaConfig: lambdaConfig,
    UserPoolTags: userPoolTags,
  }

  return { Type: 'AWS::Cognito::UserPool', Properties: prune(props) }
}

function buildClient(client) {
  const oauth = client.allowedOAuthFlowsUserPoolClient
  const props = {
    UserPoolId: { Ref: 'UserPool' },
    ClientName: client.clientName,
    GenerateSecret: client.generateSecret,
    ExplicitAuthFlows: client.explicitAuthFlows,
    AccessTokenValidity: client.accessTokenValidity,
    IdTokenValidity: client.idTokenValidity,
    RefreshTokenValidity: client.refreshTokenValidity,
    TokenValidityUnits: {
      AccessToken: client.accessTokenUnit,
      IdToken: client.idTokenUnit,
      RefreshToken: client.refreshTokenUnit,
    },
    AuthSessionValidity: client.authSessionValidity,
    AllowedOAuthFlowsUserPoolClient: oauth,
    AllowedOAuthFlows: oauth ? client.allowedOAuthFlows : undefined,
    AllowedOAuthScopes: oauth ? client.allowedOAuthScopes : undefined,
    CallbackURLs: oauth ? client.callbackURLs : undefined,
    LogoutURLs: oauth ? client.logoutURLs : undefined,
    DefaultRedirectURI: oauth ? client.defaultRedirectURI : undefined,
    SupportedIdentityProviders: client.supportedIdentityProviders,
    PreventUserExistenceErrors: client.preventUserExistenceErrors,
    EnableTokenRevocation: client.enableTokenRevocation,
    EnablePropagateAdditionalUserContextData:
      client.enablePropagateAdditionalUserContextData,
    ReadAttributes: client.readAttributes,
    WriteAttributes: client.writeAttributes,
  }
  return { Type: 'AWS::Cognito::UserPoolClient', Properties: prune(props) }
}

export function generateTemplate(state) {
  const { userPool, appClients, domain, organization, region, uniqueId } = state

  const resources = {
    UserPool: buildUserPool(userPool, { organization, uniqueId }),
  }

  const outputs = {
    UserPoolId: { Description: 'Cognito User Pool ID', Value: { Ref: 'UserPool' } },
    UserPoolArn: {
      Description: 'Cognito User Pool ARN',
      Value: { 'Fn::GetAtt': ['UserPool', 'Arn'] },
    },
  }

  const usedIds = new Set(['UserPool'])
  appClients.forEach((client, i) => {
    let logical = 'Client' + pascal(client.clientName, 'App' + (i + 1))
    while (usedIds.has(logical)) logical += 'X'
    usedIds.add(logical)
    resources[logical] = buildClient(client)
    outputs[logical + 'Id'] = {
      Description: `App client ID for "${client.clientName}"`,
      Value: { Ref: logical },
    }
  })

  // SES email templates uploaded for the custom backend sender.
  if (userPool.deliveryMode === 'custom') {
    const templates = userPool.htmlTemplates || {}
    Object.entries(templates).forEach(([key, tmpl]) => {
      if (!tmpl || !tmpl.html) return
      const logical = 'EmailTemplate' + pascal(key, key)
      const namePrefix = pascal(organization, 'Org').slice(0, 30)
      const templateName = `${namePrefix}-${key}-${uniqueId || 'tmpl'}`.slice(0, 64)
      resources[logical] = {
        Type: 'AWS::SES::Template',
        Properties: prune({
          Template: {
            TemplateName: templateName,
            SubjectPart: tmpl.subject,
            HtmlPart: tmpl.html,
          },
        }),
      }
      outputs[logical + 'Name'] = {
        Description: `SES template name for "${key}"`,
        Value: templateName,
      }
    })
  }

  if (domain.enabled && (domain.domainPrefix || domain.customDomain)) {
    const domainProps = {
      UserPoolId: { Ref: 'UserPool' },
      Domain: domain.type === 'custom' ? domain.customDomain : domain.domainPrefix,
      CustomDomainConfig:
        domain.type === 'custom'
          ? { CertificateArn: domain.certificateArn }
          : undefined,
    }
    resources.UserPoolDomain = {
      Type: 'AWS::Cognito::UserPoolDomain',
      Properties: prune(domainProps),
    }
    outputs.HostedUIDomain = {
      Description: 'Cognito hosted UI domain',
      Value: { Ref: 'UserPoolDomain' },
    }
  }

  const descParts = [`Cognito provisioning for ${organization || 'organization'}`]
  if (uniqueId) descParts.push(`id ${uniqueId}`)
  if (region) descParts.push(`region ${region}`)

  const template = {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: `${descParts.join(' · ')} — generated by AuthPlatform`,
    Resources: resources,
    Outputs: outputs,
  }

  return template
}

export function templateAsJson(state) {
  return JSON.stringify(generateTemplate(state), null, 2)
}

export function templateAsYaml(state) {
  return toYaml(generateTemplate(state))
}

/* ------------------------------------------------------------------
   Validation — returns a list of { level, message, stepId } issues.
------------------------------------------------------------------ */
export function validate(state) {
  const issues = []
  const up = state.userPool
  const err = (message, stepId) => issues.push({ level: 'error', message, stepId })
  const warn = (message, stepId) => issues.push({ level: 'warn', message, stepId })

  if (!state.organization.trim()) err('Organization name is required.', null)
  else if (state.organization.length > 32)
    err('Organization name must be 32 characters or fewer.', null)
  if (!/^[a-z0-9]{8}$/.test(state.uniqueId || ''))
    err('A valid 8-character unique ID is required.', null)
  if (!up.poolName.trim()) err('User pool name is required.', 'basics')
  else if (
    state.organization &&
    up.poolName.trim().toLowerCase() === state.organization.trim().toLowerCase()
  )
    warn('User pool name matches the organization name — consider a distinct name.', 'basics')

  const useAlias = up.aliasAttributes.length > 0
  if (!useAlias && up.usernameAttributes.length === 0) {
    warn(
      'No sign-in attribute selected — users will sign in with a username only.',
      'signin'
    )
  }

  if (up.mfaConfiguration !== 'OFF' && !up.mfaSms && !up.mfaTotp) {
    err('MFA is enabled but no MFA method (SMS / TOTP) is selected.', 'mfa')
  }
  if (up.mfaSms && !up.smsEnabled) {
    err('SMS MFA requires SMS (SNS) configuration to be enabled.', 'messaging')
  }

  if (up.deliveryMode === 'custom') {
    if (!up.takeOverEmail && !up.takeOverSms)
      warn('Custom delivery selected but neither email nor SMS is taken over.', 'messaging')
    if (up.takeOverEmail && !up.customEmailSenderArn)
      err('Custom email sender Lambda ARN is required.', 'messaging')
    if (up.takeOverSms && !up.customSmsSenderArn)
      err('Custom SMS sender Lambda ARN is required.', 'messaging')
    if ((up.takeOverEmail || up.takeOverSms) && !up.senderKmsKeyArn)
      err('A KMS key ARN is required for custom senders (Cognito encrypts the code with it).', 'messaging')
    if (up.takeOverEmail && !up.sesFromDomain && !up.sesFromAddress)
      warn('No verified SES sending domain/address set for the backend sender.', 'messaging')
  } else {
    if (up.emailSendingAccount === 'DEVELOPER') {
      if (!up.sesSourceArn) err('SES source ARN is required when sending via Amazon SES.', 'messaging')
      if (!up.emailFrom) warn('No "From" address set for SES email.', 'messaging')
    }
    if (up.smsEnabled && !up.smsSnsCallerArn) {
      err('SMS is enabled but no SNS caller IAM role ARN is provided.', 'messaging')
    }
  }

  if (up.accountRecovery.length === 0) {
    warn('No account recovery mechanism configured.', 'recovery')
  }

  if (state.appClients.length === 0) {
    err('At least one app client is required for isolation.', 'clients')
  }
  state.appClients.forEach((c) => {
    if (!c.clientName.trim()) err(`An app client is missing a name.`, 'clients')
    if (c.explicitAuthFlows.length === 0) {
      warn(`App client "${c.clientName}" has no auth flows enabled.`, 'clients')
    }
    if (c.allowedOAuthFlowsUserPoolClient) {
      if (c.allowedOAuthFlows.length === 0)
        err(`App client "${c.clientName}" enables OAuth but selects no OAuth flows.`, 'clients')
      const interactive =
        c.allowedOAuthFlows.includes('code') || c.allowedOAuthFlows.includes('implicit')
      if (interactive && c.callbackURLs.length === 0)
        err(`App client "${c.clientName}" needs at least one callback URL for the hosted UI.`, 'clients')
    }
  })

  if (state.domain.enabled) {
    if (state.domain.type === 'cognito' && !state.domain.domainPrefix)
      err('Domain prefix is required for a Cognito-hosted domain.', 'domain')
    if (state.domain.type === 'custom') {
      if (!state.domain.customDomain) err('Custom domain name is required.', 'domain')
      if (!state.domain.certificateArn)
        err('An ACM certificate ARN (us-east-1) is required for a custom domain.', 'domain')
    }
  }

  return issues
}
