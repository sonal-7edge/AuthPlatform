import {
  useStore,
  STANDARD_ATTRIBUTES,
  LAMBDA_TRIGGERS,
  MESSAGE_TEMPLATES,
} from '../state/store.jsx'
import {
  TextField,
  NumberField,
  TextArea,
  Select,
  Toggle,
  ChipGroup,
} from '../components/fields.jsx'

function usePool() {
  const { state, dispatch } = useStore()
  const up = state.userPool
  const setPool = (patch) => dispatch({ type: 'SET_POOL', patch })
  return { up, setPool, state, dispatch }
}

/* ---------------- 1. Basics ---------------- */
export function Basics() {
  const { up, setPool, state } = usePool()
  return (
    <>
      <div className="card">
        <div className="card-title">User pool identity</div>
        <div className="card-desc">
          Names and protection settings for the pool. Region ({state.region}) and unique
          ID are set in organization setup.
        </div>
        <TextField
          label="User pool name"
          required
          placeholder="customers-user-pool"
          value={up.poolName}
          onChange={(e) => setPool({ poolName: e.target.value })}
          hint={`Choose a distinct name for the pool (not your organization name). Tip: append your unique ID "${state.uniqueId || '—'}" to keep it unique.`}
        />
      </div>

      <div className="card">
        <div className="card-title">Protection</div>
        <Toggle
          label="Deletion protection"
          hint="Prevents the user pool from being accidentally deleted."
          checked={up.deletionProtection}
          onChange={(v) => setPool({ deletionProtection: v })}
        />
        <Toggle
          label="Restrict sign-up to admins only"
          hint="Only administrators can create users (self sign-up disabled)."
          checked={up.allowAdminCreateUserOnly}
          onChange={(v) => setPool({ allowAdminCreateUserOnly: v })}
        />
      </div>

      <PoolTags up={up} setPool={setPool} />
    </>
  )
}

function PoolTags({ up, setPool }) {
  const update = (i, patch) =>
    setPool({ tags: up.tags.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) })
  return (
    <div className="card">
      <div className="card-title">Tags</div>
      <div className="card-desc">Key/value tags applied to the user pool resource.</div>
      {up.tags.length > 0 && (
        <div className="kv-head">
          <span className="label">Key</span>
          <span className="label">Value</span>
          <span />
        </div>
      )}
      {up.tags.map((t, i) => (
        <div className="kv-row" key={i}>
          <input
            className="input"
            placeholder="Environment"
            value={t.key}
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <input
            className="input"
            placeholder="production"
            value={t.value}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <button
            className="btn btn-danger-ghost btn-sm kv-remove"
            aria-label="Remove tag"
            onClick={() => setPool({ tags: up.tags.filter((_, idx) => idx !== i) })}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setPool({ tags: [...up.tags, { key: '', value: '' }] })}
      >
        + Add tag
      </button>
    </div>
  )
}

/* ---------------- 2. Sign-in experience ---------------- */
export function SignIn() {
  const { up, setPool } = usePool()
  return (
    <>
      <div className="card">
        <div className="card-title">Sign-in identifiers</div>
        <div className="card-desc">
          How users sign in. Username and alias attributes are mutually exclusive.
        </div>
        <ChipGroup
          label="Sign in with (username attributes)"
          hint="Users sign in using these attributes as their username."
          options={[
            { value: 'email', label: 'Email' },
            { value: 'phone_number', label: 'Phone number' },
          ]}
          value={up.usernameAttributes}
          onChange={(v) => setPool({ usernameAttributes: v, aliasAttributes: [] })}
        />
        <ChipGroup
          label="Or allow alias sign-in"
          hint="Alternative: keep a separate username but allow these as aliases."
          options={[
            { value: 'email', label: 'Email' },
            { value: 'phone_number', label: 'Phone number' },
            { value: 'preferred_username', label: 'Preferred username' },
          ]}
          value={up.aliasAttributes}
          onChange={(v) => setPool({ aliasAttributes: v, usernameAttributes: [] })}
        />
      </div>

      <div className="card">
        <div className="card-title">Verification</div>
        <ChipGroup
          label="Auto-verified attributes"
          hint="Attributes Cognito will automatically send verification codes for."
          options={[
            { value: 'email', label: 'Email' },
            { value: 'phone_number', label: 'Phone number' },
          ]}
          value={up.autoVerifiedAttributes}
          onChange={(v) => setPool({ autoVerifiedAttributes: v })}
        />
        <Toggle
          label="Case-sensitive usernames"
          hint="When off, 'User' and 'user' are treated as the same username."
          checked={up.usernameCaseSensitive}
          onChange={(v) => setPool({ usernameCaseSensitive: v })}
        />
      </div>
    </>
  )
}

/* ---------------- 3. Password policy ---------------- */
export function Password() {
  const { up, setPool } = usePool()
  return (
    <div className="card">
      <div className="card-title">Password policy</div>
      <div className="card-desc">Complexity requirements enforced at sign-up and reset.</div>
      <div className="field-row">
        <NumberField
          label="Minimum length"
          min={6}
          max={99}
          value={up.passwordMinimumLength}
          onChange={(v) => setPool({ passwordMinimumLength: v })}
        />
        <NumberField
          label="Temporary password validity (days)"
          min={0}
          max={365}
          value={up.temporaryPasswordValidityDays}
          onChange={(v) => setPool({ temporaryPasswordValidityDays: v })}
        />
      </div>
      <div style={{ marginTop: 8 }}>
        <Toggle
          label="Require uppercase letters"
          checked={up.passwordRequireUppercase}
          onChange={(v) => setPool({ passwordRequireUppercase: v })}
        />
        <Toggle
          label="Require lowercase letters"
          checked={up.passwordRequireLowercase}
          onChange={(v) => setPool({ passwordRequireLowercase: v })}
        />
        <Toggle
          label="Require numbers"
          checked={up.passwordRequireNumbers}
          onChange={(v) => setPool({ passwordRequireNumbers: v })}
        />
        <Toggle
          label="Require symbols"
          checked={up.passwordRequireSymbols}
          onChange={(v) => setPool({ passwordRequireSymbols: v })}
        />
      </div>
    </div>
  )
}

/* ---------------- 4. MFA ---------------- */
export function Mfa() {
  const { up, setPool } = usePool()
  return (
    <>
      <div className="card">
        <div className="card-title">Multi-factor authentication</div>
        <ChipGroup
          label="MFA enforcement"
          radio
          options={[
            { value: 'OFF', label: 'Off' },
            { value: 'OPTIONAL', label: 'Optional' },
            { value: 'ON', label: 'Required' },
          ]}
          value={up.mfaConfiguration}
          onChange={(v) => setPool({ mfaConfiguration: v })}
        />
      </div>
      {up.mfaConfiguration !== 'OFF' && (
        <div className="card card-accent">
          <div className="card-title">MFA methods</div>
          <Toggle
            label="Authenticator app (TOTP)"
            hint="Software token MFA — recommended."
            checked={up.mfaTotp}
            onChange={(v) => setPool({ mfaTotp: v })}
          />
          <Toggle
            label="SMS text message"
            hint="Requires SMS (SNS) configuration in the Messaging step."
            checked={up.mfaSms}
            onChange={(v) => setPool({ mfaSms: v })}
          />
        </div>
      )}
    </>
  )
}

/* ---------------- 5. Attributes ---------------- */
const STRING_ATTR_MAX = 2048

// For String attributes, clamp length constraints to Cognito's 0–2048 range.
// Number value constraints are left unbounded.
function clampLen(raw, type) {
  if (raw === '') return ''
  const n = Number(raw)
  if (Number.isNaN(n)) return ''
  if (type !== 'String') return n
  return Math.max(0, Math.min(STRING_ATTR_MAX, n))
}

export function Attributes() {
  const { up, setPool } = usePool()
  const addCustom = () =>
    setPool({
      customAttributes: [
        ...up.customAttributes,
        { name: '', type: 'String', mutable: true, min: '', max: '' },
      ],
    })
  const updateCustom = (i, patch) =>
    setPool({
      customAttributes: up.customAttributes.map((c, idx) =>
        idx === i ? { ...c, ...patch } : c
      ),
    })
  const removeCustom = (i) =>
    setPool({ customAttributes: up.customAttributes.filter((_, idx) => idx !== i) })

  return (
    <>
      <div className="card">
        <div className="card-title">Required standard attributes</div>
        <div className="card-desc">
          Standard OIDC attributes a user must provide at sign-up.
        </div>
        <ChipGroup
          options={STANDARD_ATTRIBUTES}
          value={up.requiredAttributes}
          onChange={(v) => setPool({ requiredAttributes: v })}
        />
      </div>

      <div className="card">
        <div className="card-title">Custom attributes</div>
        <div className="card-desc">
          Stored as <code>custom:name</code>. Cannot be required and cannot be deleted later.
        </div>
        {up.customAttributes.map((c, i) => (
          <div className="repeat-item" key={i}>
            <div className="repeat-head">
              <span className="r-title">
                <span className="r-index">{i + 1}</span>
                {c.name ? `custom:${c.name}` : 'New attribute'}
              </span>
              <button
                className="btn btn-danger-ghost btn-sm"
                onClick={() => removeCustom(i)}
              >
                Remove
              </button>
            </div>
            <div className="repeat-body">
              <div className="field-row">
                <TextField
                  label="Attribute name"
                  placeholder="tenantId"
                  maxLength={20}
                  value={c.name}
                  onChange={(e) => updateCustom(i, { name: e.target.value })}
                  hint="Max 20 characters."
                />
                <Select
                  label="Type"
                  value={c.type}
                  onChange={(e) => updateCustom(i, { type: e.target.value })}
                  options={[
                    { value: 'String', label: 'String' },
                    { value: 'Number', label: 'Number' },
                    { value: 'DateTime', label: 'DateTime' },
                    { value: 'Boolean', label: 'Boolean' },
                  ]}
                />
              </div>
              {(c.type === 'String' || c.type === 'Number') && (
                <div className="field-row">
                  <TextField
                    label={c.type === 'Number' ? 'Min value' : 'Min length'}
                    type="number"
                    min={c.type === 'String' ? 0 : undefined}
                    max={c.type === 'String' ? STRING_ATTR_MAX : undefined}
                    value={c.min}
                    onChange={(e) =>
                      updateCustom(i, {
                        min: clampLen(e.target.value, c.type),
                      })
                    }
                  />
                  <TextField
                    label={c.type === 'Number' ? 'Max value' : 'Max length'}
                    type="number"
                    min={c.type === 'String' ? 0 : undefined}
                    max={c.type === 'String' ? STRING_ATTR_MAX : undefined}
                    value={c.max}
                    onChange={(e) =>
                      updateCustom(i, {
                        max: clampLen(e.target.value, c.type),
                      })
                    }
                    hint={c.type === 'String' ? `0–${STRING_ATTR_MAX} characters.` : undefined}
                  />
                </div>
              )}
              <Toggle
                label="Mutable"
                hint="Can the value be changed after it is set?"
                checked={c.mutable}
                onChange={(v) => updateCustom(i, { mutable: v })}
              />
            </div>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={addCustom}>
          + Add custom attribute
        </button>
      </div>
    </>
  )
}

/* ---------------- 6. Account recovery ---------------- */
export function Recovery() {
  const { up, setPool } = usePool()
  return (
    <div className="card">
      <div className="card-title">Account recovery</div>
      <div className="card-desc">
        Methods a user can use to recover their account, in priority order.
      </div>
      <ChipGroup
        label="Recovery mechanisms"
        hint="Selection order determines priority (first = highest)."
        options={[
          { value: 'verified_email', label: 'Verified email' },
          { value: 'verified_phone_number', label: 'Verified phone' },
        ]}
        value={up.accountRecovery}
        onChange={(v) => setPool({ accountRecovery: v })}
      />
    </div>
  )
}

/* ---------------- 7. Messaging ---------------- */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

function TemplateUploader({ tmpl, value, onChange }) {
  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const html = await readFileAsText(file)
    onChange({ subject: value?.subject ?? tmpl.subject, fileName: file.name, html })
    e.target.value = ''
  }
  return (
    <div className="repeat-item">
      <div className="repeat-head">
        <span className="r-title">{tmpl.label}</span>
        {value?.html && (
          <button className="btn btn-danger-ghost btn-sm" onClick={() => onChange(undefined)}>
            Remove
          </button>
        )}
      </div>
      <div className="repeat-body">
        <TextField
          label="Subject"
          value={value?.subject ?? tmpl.subject}
          onChange={(e) => onChange({ ...(value || {}), subject: e.target.value })}
        />
        <label className="label">HTML template</label>
        {value?.html ? (
          <div className="file-chip">
            <span>
              📄 {value.fileName} · {value.html.length.toLocaleString()} chars
            </span>
            <label className="btn btn-ghost btn-sm">
              Replace
              <input type="file" accept=".html,.htm,text/html" hidden onChange={handleFile} />
            </label>
          </div>
        ) : (
          <label className="file-drop">
            <input type="file" accept=".html,.htm,text/html" hidden onChange={handleFile} />
            <span>Click to upload an .html template</span>
          </label>
        )}
      </div>
    </div>
  )
}

export function Messaging() {
  const { up, setPool } = usePool()
  const custom = up.deliveryMode === 'custom'
  const setTemplate = (key, val) =>
    setPool({ htmlTemplates: { ...up.htmlTemplates, [key]: val } })
  return (
    <>
      <div className="card">
        <div className="card-title">Delivery strategy</div>
        <div className="card-desc">
          Choose who sends verification codes, MFA codes and invitations.
        </div>
        <ChipGroup
          radio
          options={[
            { value: 'cognito', label: 'Cognito-managed' },
            { value: 'custom', label: 'Custom backend sender (suppress Cognito)' },
          ]}
          value={up.deliveryMode}
          onChange={(v) => setPool({ deliveryMode: v })}
        />
        <div className="hint">
          {custom
            ? 'Cognito hands the one-time code to your Lambda, which sends it from your backend (e.g. SES with your HTML templates). Cognito’s built-in email/SMS are suppressed.'
            : 'Cognito sends messages directly using the providers configured below.'}
        </div>
      </div>

      {!custom && (
        <>
      <div className="card">
        <div className="card-title">Email delivery</div>
        <Select
          label="Email sending account"
          value={up.emailSendingAccount}
          onChange={(e) => setPool({ emailSendingAccount: e.target.value })}
          options={[
            { value: 'COGNITO_DEFAULT', label: 'Send with Cognito (default, low volume)' },
            { value: 'DEVELOPER', label: 'Send with Amazon SES' },
          ]}
        />
        {up.emailSendingAccount === 'DEVELOPER' && (
          <>
            <div className="field-row">
              <TextField
                label="From address"
                placeholder="no-reply@example.com"
                value={up.emailFrom}
                onChange={(e) => setPool({ emailFrom: e.target.value })}
              />
              <TextField
                label="Reply-to address"
                placeholder="support@example.com"
                value={up.emailReplyTo}
                onChange={(e) => setPool({ emailReplyTo: e.target.value })}
              />
            </div>
            <TextField
              label="SES source ARN"
              required
              placeholder="arn:aws:ses:us-east-1:111122223333:identity/example.com"
              value={up.sesSourceArn}
              onChange={(e) => setPool({ sesSourceArn: e.target.value })}
            />
            <TextField
              label="SES configuration set"
              placeholder="(optional)"
              value={up.sesConfigurationSet}
              onChange={(e) => setPool({ sesConfigurationSet: e.target.value })}
            />
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">SMS delivery (Amazon SNS)</div>
        <Toggle
          label="Enable SMS"
          hint="Required for SMS MFA and phone verification."
          checked={up.smsEnabled}
          onChange={(v) => setPool({ smsEnabled: v })}
        />
        {up.smsEnabled && (
          <>
            <TextField
              label="SNS caller IAM role ARN"
              required
              placeholder="arn:aws:iam::111122223333:role/CognitoSMSRole"
              value={up.smsSnsCallerArn}
              onChange={(e) => setPool({ smsSnsCallerArn: e.target.value })}
            />
            <div className="field-row">
              <TextField
                label="External ID"
                placeholder="cognito-sms-external-id"
                value={up.smsExternalId}
                onChange={(e) => setPool({ smsExternalId: e.target.value })}
              />
              <TextField
                label="SNS region"
                placeholder="us-east-1"
                value={up.smsSnsRegion}
                onChange={(e) => setPool({ smsSnsRegion: e.target.value })}
              />
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">Verification &amp; invitation messages</div>
        <ChipGroup
          label="Verify email by"
          radio
          options={[
            { value: 'CODE', label: 'Code' },
            { value: 'LINK', label: 'Link' },
          ]}
          value={up.verificationMessageType}
          onChange={(v) => setPool({ verificationMessageType: v })}
        />
        <div className="subhead">Verification message</div>
        <TextField
          label="Email subject"
          value={up.emailVerificationSubject}
          onChange={(e) => setPool({ emailVerificationSubject: e.target.value })}
        />
        <TextArea
          label="Email message"
          hint="Use {####} for the code or {##Verify##} for a link."
          value={up.emailVerificationMessage}
          onChange={(e) => setPool({ emailVerificationMessage: e.target.value })}
        />
        <TextArea
          label="SMS verification message"
          hint="Use {####} for the code."
          value={up.smsVerificationMessage}
          onChange={(e) => setPool({ smsVerificationMessage: e.target.value })}
        />
        <div className="subhead">Admin invitation message</div>
        <TextField
          label="Invite email subject"
          value={up.inviteEmailSubject}
          onChange={(e) => setPool({ inviteEmailSubject: e.target.value })}
        />
        <TextArea
          label="Invite email message"
          hint="Use {username} and {####} (temporary password)."
          value={up.inviteEmailMessage}
          onChange={(e) => setPool({ inviteEmailMessage: e.target.value })}
        />
        <TextArea
          label="Invite SMS message"
          value={up.inviteSmsMessage}
          onChange={(e) => setPool({ inviteSmsMessage: e.target.value })}
        />
      </div>
        </>
      )}

      {custom && (
        <>
          <div className="note">
            <strong>Requirements:</strong> custom senders need a KMS key (Cognito encrypts
            the one-time code with it before calling your Lambda), and your backend must send
            from a domain or address verified in Amazon SES.
          </div>
          <div className="card card-accent">
            <div className="card-title">Custom backend sender</div>
            <Toggle
              label="Take over email sending"
              hint="Suppress Cognito email — your Lambda sends it."
              checked={up.takeOverEmail}
              onChange={(v) => setPool({ takeOverEmail: v })}
            />
            <Toggle
              label="Take over SMS sending"
              hint="Suppress Cognito SMS — your Lambda sends it."
              checked={up.takeOverSms}
              onChange={(v) => setPool({ takeOverSms: v })}
            />
            {up.takeOverEmail && (
              <TextField
                label="Custom email sender Lambda ARN"
                required
                placeholder="arn:aws:lambda:us-east-1:111122223333:function:CustomEmailSender"
                value={up.customEmailSenderArn}
                onChange={(e) => setPool({ customEmailSenderArn: e.target.value })}
              />
            )}
            {up.takeOverSms && (
              <TextField
                label="Custom SMS sender Lambda ARN"
                required
                placeholder="arn:aws:lambda:us-east-1:111122223333:function:CustomSMSSender"
                value={up.customSmsSenderArn}
                onChange={(e) => setPool({ customSmsSenderArn: e.target.value })}
              />
            )}
            <TextField
              label="KMS key ARN"
              required
              placeholder="arn:aws:kms:us-east-1:111122223333:key/abcd-1234"
              value={up.senderKmsKeyArn}
              onChange={(e) => setPool({ senderKmsKeyArn: e.target.value })}
            />
            <div className="field-row">
              <TextField
                label="SES verified domain"
                placeholder="example.com"
                value={up.sesFromDomain}
                onChange={(e) => setPool({ sesFromDomain: e.target.value })}
                hint="Must be a verified identity in Amazon SES."
              />
              <TextField
                label="From address"
                placeholder="no-reply@example.com"
                value={up.sesFromAddress}
                onChange={(e) => setPool({ sesFromAddress: e.target.value })}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-title">HTML email templates</div>
            <div className="card-desc">
              Upload an HTML file per message type. Each becomes an AWS::SES::Template your
              backend can send by name.
            </div>
            {MESSAGE_TEMPLATES.map((t) => (
              <TemplateUploader
                key={t.key}
                tmpl={t}
                value={up.htmlTemplates[t.key]}
                onChange={(v) => setTemplate(t.key, v)}
              />
            ))}
          </div>
        </>
      )}
    </>
  )
}

/* ---------------- 8. Devices ---------------- */
export function Devices() {
  const { up, setPool } = usePool()
  return (
    <div className="card">
      <div className="card-title">Device tracking</div>
      <div className="card-desc">
        Remember user devices to support device-based MFA suppression.
      </div>
      <ChipGroup
        radio
        options={[
          { value: 'OFF', label: 'No tracking' },
          { value: 'OPTIONAL', label: 'User opt-in' },
          { value: 'ALWAYS', label: 'Always remember' },
        ]}
        value={up.deviceTracking}
        onChange={(v) => setPool({ deviceTracking: v })}
      />
    </div>
  )
}

/* ---------------- 9. Security & triggers ---------------- */
export function Security() {
  const { up, setPool } = usePool()
  const setTrigger = (key, value) =>
    setPool({ lambdaTriggers: { ...up.lambdaTriggers, [key]: value } })
  return (
    <>
      <div className="card">
        <div className="card-title">Advanced security (threat protection)</div>
        <ChipGroup
          radio
          options={[
            { value: 'OFF', label: 'Off' },
            { value: 'AUDIT', label: 'Audit only' },
            { value: 'ENFORCED', label: 'Enforced' },
          ]}
          value={up.advancedSecurityMode}
          onChange={(v) => setPool({ advancedSecurityMode: v })}
          hint="Adaptive authentication and compromised-credential detection."
        />
      </div>
      <div className="card">
        <div className="card-title">Lambda triggers</div>
        <div className="card-desc">
          Attach Lambda functions to user pool lifecycle events (paste function ARNs).
        </div>
        {LAMBDA_TRIGGERS.map(([key, label]) => (
          <TextField
            key={key}
            label={label}
            placeholder="arn:aws:lambda:region:account:function:name"
            value={up.lambdaTriggers[key] || ''}
            onChange={(e) => setTrigger(key, e.target.value)}
          />
        ))}
      </div>
    </>
  )
}
