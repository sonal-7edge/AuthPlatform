import { useMemo, useState } from 'react'
import { useStore } from '../state/store.jsx'
import { templateAsJson, templateAsYaml, validate } from '../lib/cloudformation.js'

export function Review({ onJump }) {
  const { state } = useStore()
  const [format, setFormat] = useState('yaml')
  const [copied, setCopied] = useState(false)

  const issues = useMemo(() => validate(state), [state])
  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warn')

  const code = useMemo(
    () => (format === 'json' ? templateAsJson(state) : templateAsYaml(state)),
    [state, format]
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const download = () => {
    const blob = new Blob([code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const base = (state.userPool.poolName || 'cognito-stack')
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase()
    a.href = url
    a.download = `${base}.${format === 'json' ? 'json' : 'yaml'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const resourceCount =
    1 + state.appClients.length + (state.domain.enabled ? 1 : 0)

  return (
    <>
      <div className={`validation ${errors.length === 0 ? 'ok' : ''}`}>
        <h4>
          {errors.length === 0 ? '✓ Ready to deploy' : `⚠ ${errors.length} issue(s) to resolve`}
          <span className="pill pill-teal" style={{ marginLeft: 8 }}>
            {resourceCount} resources
          </span>
        </h4>
        {errors.length === 0 && warnings.length === 0 && (
          <p style={{ fontSize: 12.5 }}>
            Configuration is valid. Copy or download the template and deploy it with
            CloudFormation.
          </p>
        )}
        {(errors.length > 0 || warnings.length > 0) && (
          <ul>
            {errors.map((e, i) => (
              <li key={`e${i}`}>
                {e.message}{' '}
                {e.stepId && (
                  <button className="val-link" onClick={() => onJump(e.stepId)}>
                    Fix
                  </button>
                )}
              </li>
            ))}
            {warnings.map((w, i) => (
              <li key={`w${i}`} style={{ color: '#a9760a' }}>
                {w.message}{' '}
                {w.stepId && (
                  <button className="val-link" onClick={() => onJump(w.stepId)}>
                    Review
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="code-card">
        <div className="code-bar">
          <span className="ctitle">
            CloudFormation template
            <span className="format-toggle">
              <button
                className={format === 'yaml' ? 'active' : ''}
                onClick={() => setFormat('yaml')}
              >
                YAML
              </button>
              <button
                className={format === 'json' ? 'active' : ''}
                onClick={() => setFormat('json')}
              >
                JSON
              </button>
            </span>
          </span>
          <span className="code-actions">
            <button className="btn btn-ghost btn-sm" onClick={copy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button className="btn btn-amber btn-sm" onClick={download}>
              Download
            </button>
          </span>
        </div>
        <pre className="code-pre">{code}</pre>
      </div>
    </>
  )
}
