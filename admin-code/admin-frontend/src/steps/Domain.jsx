import { useStore } from '../state/store.jsx'
import { TextField, Toggle, ChipGroup } from '../components/fields.jsx'

export function Domain() {
  const { state, dispatch } = useStore()
  const d = state.domain
  const set = (patch) => dispatch({ type: 'SET_DOMAIN', patch })

  return (
    <div className="card">
      <div className="card-title">Hosted UI domain</div>
      <div className="card-desc">
        Optional domain that hosts the Cognito sign-in pages and OAuth endpoints.
      </div>
      <Toggle
        label="Provision a user pool domain"
        checked={d.enabled}
        onChange={(v) => set({ enabled: v })}
      />

      {d.enabled && (
        <>
          <div className="subhead">Domain type</div>
          <ChipGroup
            radio
            options={[
              { value: 'cognito', label: 'Cognito prefix domain' },
              { value: 'custom', label: 'Custom domain' },
            ]}
            value={d.type}
            onChange={(v) => set({ type: v })}
          />

          {d.type === 'cognito' ? (
            <TextField
              label="Domain prefix"
              required
              prefix="https://"
              suffix={`.auth.${state.region}.amazoncognito.com`}
              placeholder="my-org-auth"
              value={d.domainPrefix}
              onChange={(e) => set({ domainPrefix: e.target.value })}
              hint="Lowercase letters, numbers and hyphens. Must be globally unique."
            />
          ) : (
            <>
              <TextField
                label="Custom domain"
                required
                placeholder="auth.example.com"
                value={d.customDomain}
                onChange={(e) => set({ customDomain: e.target.value })}
              />
              <TextField
                label="ACM certificate ARN"
                required
                placeholder="arn:aws:acm:us-east-1:111122223333:certificate/..."
                value={d.certificateArn}
                onChange={(e) => set({ certificateArn: e.target.value })}
                hint="Certificate must be in us-east-1 for Cognito custom domains."
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
