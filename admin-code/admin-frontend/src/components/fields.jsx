import { useState } from 'react'

export function Field({ label, hint, required, children, htmlFor }) {
  return (
    <div className="field">
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function TextField({ label, hint, required, prefix, suffix, ...props }) {
  const input = <input className="input" {...props} />
  return (
    <Field label={label} hint={hint} required={required}>
      {prefix || suffix ? (
        <div className="input-prefixed">
          {prefix && <span className="prefix">{prefix}</span>}
          {input}
          {suffix && <span className="suffix">{suffix}</span>}
        </div>
      ) : (
        input
      )}
    </Field>
  )
}

export function NumberField({ label, hint, required, value, onChange, ...props }) {
  return (
    <Field label={label} hint={hint} required={required}>
      <input
        type="number"
        className="input"
        value={value}
        onChange={(e) =>
          onChange(e.target.value === '' ? '' : Number(e.target.value))
        }
        {...props}
      />
    </Field>
  )
}

export function TextArea({ label, hint, required, ...props }) {
  return (
    <Field label={label} hint={hint} required={required}>
      <textarea className="input" {...props} />
    </Field>
  )
}

export function Select({ label, hint, required, options, ...props }) {
  return (
    <Field label={label} hint={hint} required={required}>
      <select className="select" {...props}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function Toggle({ label, hint, checked, onChange }) {
  return (
    <div className="toggle-field">
      <div className="toggle-text">
        <div className="t-label">{label}</div>
        {hint && <div className="t-hint">{hint}</div>}
      </div>
      <label className="switch">
        <input
          type="checkbox"
          checked={!!checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="track" />
      </label>
    </div>
  )
}

const Check = () => (
  <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
    <path
      d="M2.5 6.5L5 9L9.5 3.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/* Multi-select chip group (checkbox semantics). */
export function ChipGroup({ label, hint, options, value, onChange, radio }) {
  const toggle = (v) => {
    if (radio) return onChange(v)
    if (value.includes(v)) onChange(value.filter((x) => x !== v))
    else onChange([...value, v])
  }
  const selected = (v) => (radio ? value === v : value.includes(v))
  return (
    <Field label={label} hint={hint}>
      <div className="chip-group">
        {options.map((o) => {
          const val = typeof o === 'string' ? o : o.value
          const lbl = typeof o === 'string' ? o : o.label
          return (
            <label
              key={val}
              className={`chip ${radio ? 'radio' : ''} ${selected(val) ? 'checked' : ''}`}
            >
              <input type="checkbox" checked={selected(val)} onChange={() => toggle(val)} />
              <span className="dot">{selected(val) && <Check />}</span>
              {lbl}
            </label>
          )
        })}
      </div>
    </Field>
  )
}

/* Free-form list of string values (URLs, scopes, etc.) */
export function TagList({ label, hint, value, onChange, placeholder, mono = true }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (v && !value.includes(v)) onChange([...value, v])
    setDraft('')
  }
  return (
    <Field label={label} hint={hint}>
      {value.length > 0 && (
        <div className="taglist">
          {value.map((v) => (
            <span className="tag" key={v}>
              {v}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="tag-input-row">
        <input
          className={`input ${mono ? 'mono' : ''}`}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={add}>
          Add
        </button>
      </div>
    </Field>
  )
}
