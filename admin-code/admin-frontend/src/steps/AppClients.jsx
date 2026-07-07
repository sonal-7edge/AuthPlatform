import { useStore, STANDARD_ATTRIBUTES } from '../state/store.jsx'
import {
  TextField,
  NumberField,
  Select,
  Toggle,
  ChipGroup,
  TagList,
} from '../components/fields.jsx'

const AUTH_FLOWS = [
  { value: 'ALLOW_USER_SRP_AUTH', label: 'SRP (secure remote password)' },
  { value: 'ALLOW_USER_PASSWORD_AUTH', label: 'Username/password' },
  { value: 'ALLOW_ADMIN_USER_PASSWORD_AUTH', label: 'Admin username/password' },
  { value: 'ALLOW_CUSTOM_AUTH', label: 'Custom auth (Lambda)' },
  { value: 'ALLOW_REFRESH_TOKEN_AUTH', label: 'Refresh token' },
]

const OAUTH_FLOWS = [
  { value: 'code', label: 'Authorization code grant' },
  { value: 'implicit', label: 'Implicit grant' },
  { value: 'client_credentials', label: 'Client credentials' },
]

const OAUTH_SCOPES = [
  'openid',
  'email',
  'profile',
  'phone',
  'aws.cognito.signin.user.admin',
]

const UNITS = ['seconds', 'minutes', 'hours', 'days'].map((u) => ({
  value: u,
  label: u,
}))

function TokenValidityRow({ label, hint, value, unit, onValue, onUnit }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="number"
          min={1}
          className="input"
          style={{ flex: 1 }}
          value={value}
          onChange={(e) => onValue(e.target.value === '' ? '' : Number(e.target.value))}
        />
        <select
          className="select"
          style={{ width: 130 }}
          value={unit}
          onChange={(e) => onUnit(e.target.value)}
        >
          {UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

function ClientCard({ client, index, canRemove }) {
  const { dispatch } = useStore()
  const set = (patch) => dispatch({ type: 'UPDATE_CLIENT', id: client.id, patch })
  const oauth = client.allowedOAuthFlowsUserPoolClient

  return (
    <div className="repeat-item">
      <div className="repeat-head">
        <span className="r-title">
          <span className="r-index">{index + 1}</span>
          {client.clientName || 'Unnamed client'}
        </span>
        {canRemove && (
          <button
            className="btn btn-danger-ghost btn-sm"
            onClick={() => dispatch({ type: 'REMOVE_CLIENT', id: client.id })}
          >
            Remove client
          </button>
        )}
      </div>
      <div className="repeat-body">
        <div className="field-row">
          <TextField
            label="Client name"
            required
            value={client.clientName}
            onChange={(e) => set({ clientName: e.target.value })}
          />
          <div style={{ display: 'flex', alignItems: 'center', paddingTop: 22 }}>
            <Toggle
              label="Generate client secret"
              hint="For confidential (server-side) clients."
              checked={client.generateSecret}
              onChange={(v) => set({ generateSecret: v })}
            />
          </div>
        </div>

        <div className="subhead">Authentication flows</div>
        <ChipGroup
          options={AUTH_FLOWS}
          value={client.explicitAuthFlows}
          onChange={(v) => set({ explicitAuthFlows: v })}
        />

        <div className="subhead">Token expiration</div>
        <div className="field-row">
          <TokenValidityRow
            label="Access token"
            value={client.accessTokenValidity}
            unit={client.accessTokenUnit}
            onValue={(v) => set({ accessTokenValidity: v })}
            onUnit={(u) => set({ accessTokenUnit: u })}
          />
          <TokenValidityRow
            label="ID token"
            value={client.idTokenValidity}
            unit={client.idTokenUnit}
            onValue={(v) => set({ idTokenValidity: v })}
            onUnit={(u) => set({ idTokenUnit: u })}
          />
        </div>
        <div className="field-row">
          <TokenValidityRow
            label="Refresh token"
            value={client.refreshTokenValidity}
            unit={client.refreshTokenUnit}
            onValue={(v) => set({ refreshTokenValidity: v })}
            onUnit={(u) => set({ refreshTokenUnit: u })}
          />
          <NumberField
            label="Auth session validity (minutes)"
            min={3}
            max={15}
            value={client.authSessionValidity}
            onChange={(v) => set({ authSessionValidity: v })}
          />
        </div>

        <div className="subhead">Hosted UI &amp; OAuth</div>
        <Toggle
          label="Enable Cognito Hosted UI / OAuth 2.0"
          hint="Turn on to configure callback URLs, sign-out URLs, redirect URI, OAuth grants and scopes."
          checked={oauth}
          onChange={(v) => set({ allowedOAuthFlowsUserPoolClient: v })}
        />
        {oauth && (
          <>
            <ChipGroup
              label="OAuth grant types"
              options={OAUTH_FLOWS}
              value={client.allowedOAuthFlows}
              onChange={(v) => set({ allowedOAuthFlows: v })}
            />
            <ChipGroup
              label="OAuth scopes"
              options={OAUTH_SCOPES}
              value={client.allowedOAuthScopes}
              onChange={(v) => set({ allowedOAuthScopes: v })}
            />
            <TagList
              label="Callback URLs"
              placeholder="https://app.example.com/callback"
              value={client.callbackURLs}
              onChange={(v) => set({ callbackURLs: v })}
            />
            <TagList
              label="Sign-out URLs"
              placeholder="https://app.example.com/logout"
              value={client.logoutURLs}
              onChange={(v) => set({ logoutURLs: v })}
            />
            <TextField
              label="Default redirect URI"
              placeholder="https://app.example.com/callback"
              value={client.defaultRedirectURI}
              onChange={(e) => set({ defaultRedirectURI: e.target.value })}
            />
            <ChipGroup
              label="Identity providers"
              options={['COGNITO', 'Google', 'Facebook', 'LoginWithAmazon', 'SignInWithApple']}
              value={client.supportedIdentityProviders}
              onChange={(v) => set({ supportedIdentityProviders: v })}
            />
          </>
        )}

        <div className="subhead">Behavior</div>
        <Select
          label="Prevent user existence errors"
          value={client.preventUserExistenceErrors}
          onChange={(e) => set({ preventUserExistenceErrors: e.target.value })}
          options={[
            { value: 'ENABLED', label: 'Enabled (recommended)' },
            { value: 'LEGACY', label: 'Legacy' },
          ]}
        />
        <Toggle
          label="Enable token revocation"
          checked={client.enableTokenRevocation}
          onChange={(v) => set({ enableTokenRevocation: v })}
        />
        <Toggle
          label="Propagate additional user context data"
          hint="Send device/IP context for advanced security."
          checked={client.enablePropagateAdditionalUserContextData}
          onChange={(v) => set({ enablePropagateAdditionalUserContextData: v })}
        />

        <div className="subhead">Attribute permissions</div>
        <ChipGroup
          label="Readable attributes"
          options={STANDARD_ATTRIBUTES}
          value={client.readAttributes}
          onChange={(v) => set({ readAttributes: v })}
        />
        <ChipGroup
          label="Writable attributes"
          options={STANDARD_ATTRIBUTES}
          value={client.writeAttributes}
          onChange={(v) => set({ writeAttributes: v })}
        />
      </div>
    </div>
  )
}

export function AppClients() {
  const { state, dispatch } = useStore()
  return (
    <div className="card">
      <div className="card-title">App clients · isolation boundaries</div>
      <div className="card-desc">
        Each app client is an isolated access boundary into the same user pool — its
        own auth flows, tokens, OAuth config and attribute permissions. Add one client
        per application or tenant that needs isolation.
      </div>
      {state.appClients.map((c, i) => (
        <ClientCard
          key={c.id}
          client={c}
          index={i}
          canRemove={state.appClients.length > 1}
        />
      ))}
      <button className="btn btn-navy btn-sm" onClick={() => dispatch({ type: 'ADD_CLIENT' })}>
        + Add app client
      </button>
    </div>
  )
}
