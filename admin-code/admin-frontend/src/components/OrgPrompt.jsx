import { useEffect, useRef, useState } from 'react'
import {
  AWS_REGIONS,
  ORG_NAME_MAX,
  UNIQUE_ID_LENGTH,
  makeUniqueId,
} from '../state/store.jsx'

export function OrgPrompt({
  initialName = '',
  initialRegion = 'us-east-1',
  initialUniqueId = '',
  onSubmit,
  onClose,
  dismissable,
}) {
  const [name, setName] = useState(initialName)
  const [region, setRegion] = useState(initialRegion)
  const [uniqueId, setUniqueId] = useState(initialUniqueId || makeUniqueId())
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const idValid = new RegExp(`^[a-z0-9]{${UNIQUE_ID_LENGTH}}$`).test(uniqueId)
  const valid = name.trim().length > 0 && idValid

  const submit = (e) => {
    e.preventDefault()
    if (valid) onSubmit({ name: name.trim(), region, uniqueId })
  }

  return (
    <div className="modal-overlay" onMouseDown={dismissable ? onClose : undefined}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-banner">
          <div className="blocks">
            <span style={{ background: '#f0a500' }} />
            <span style={{ background: '#fff' }} />
            <span style={{ background: '#00b4b4' }} />
          </div>
          <h2>Set up your organization</h2>
          <p>
            These details label the dashboard and keep your generated resources
            uniquely named. You can change them anytime.
          </p>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="field">
            <label className="label" htmlFor="org-name">
              Organization name<span className="req">*</span>
            </label>
            <input
              id="org-name"
              ref={inputRef}
              className="input"
              placeholder="Acme Corp"
              maxLength={ORG_NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="hint" style={{ textAlign: 'right' }}>
              {name.length}/{ORG_NAME_MAX}
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="org-region">
              AWS region<span className="req">*</span>
            </label>
            <select
              id="org-region"
              className="select"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              {AWS_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <div className="hint">Region the CloudFormation stack will be deployed into.</div>
          </div>

          <div className="field">
            <label className="label" htmlFor="org-uid">
              Unique ID<span className="req">*</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="org-uid"
                className="input mono"
                placeholder="a1b2c3d4"
                maxLength={UNIQUE_ID_LENGTH}
                value={uniqueId}
                onChange={(e) =>
                  setUniqueId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))
                }
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setUniqueId(makeUniqueId())}
              >
                Generate
              </button>
            </div>
            <div className="hint">
              {UNIQUE_ID_LENGTH} lowercase letters/numbers, appended to resource names for
              uniqueness.
              {!idValid && uniqueId.length > 0 && (
                <span style={{ color: 'var(--danger)' }}>
                  {' '}
                  Must be exactly {UNIQUE_ID_LENGTH} characters.
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={!valid}>
              Continue
            </button>
            {dismissable && (
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
