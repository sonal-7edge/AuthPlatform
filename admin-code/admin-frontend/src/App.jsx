import { useMemo, useState } from 'react'
import { StoreProvider } from './state/StoreProvider.jsx'
import { useStore } from './state/store.jsx'
import { STEPS } from './steps/index.js'
import { Sidebar } from './components/Sidebar.jsx'
import { OrgPrompt } from './components/OrgPrompt.jsx'

function ArrowLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M19 12H5M5 12L12 19M5 12L12 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12H19M19 12L12 5M19 12L12 19"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Dashboard() {
  const { state, dispatch } = useStore()
  const [activeId, setActiveId] = useState(STEPS[0].id)
  const [completed, setCompleted] = useState(() => new Set())
  const [editingOrg, setEditingOrg] = useState(false)

  const needsOrg = !state.organization
  const index = STEPS.findIndex((s) => s.id === activeId)
  const step = STEPS[index]
  const { Component } = step

  const go = (id) => {
    setActiveId(id)
    document.querySelector('.content')?.scrollTo({ top: 0 })
  }

  const next = () => {
    setCompleted((c) => new Set(c).add(activeId))
    if (index < STEPS.length - 1) go(STEPS[index + 1].id)
  }
  const back = () => {
    if (index > 0) go(STEPS[index - 1].id)
  }

  const headerTitle = useMemo(
    () => state.organization || 'Untitled organization',
    [state.organization]
  )

  return (
    <div className="app-shell">
      <Sidebar activeId={activeId} onSelect={go} completed={completed} />

      <div className="main">
        <header className="topbar">
          <div className="org-head">
            <div className="org-avatar">{initials(state.organization || '?')}</div>
            <div>
              <div className="org-title">{headerTitle}</div>
              <div className="org-meta">
                {state.region}
                {state.uniqueId && (
                  <>
                    {' · ID '}
                    <code className="id-chip">{state.uniqueId}</code>
                  </>
                )}
              </div>
            </div>
            <button className="org-edit" onClick={() => setEditingOrg(true)}>
              Edit
            </button>
          </div>
          <div className="topbar-actions">
            <span className="pill pill-amber">{state.appClients.length} app client(s)</span>
            <button className="btn btn-navy btn-sm" onClick={() => go('review')}>
              Generate template
            </button>
          </div>
        </header>

        <div className="content">
          <div className="content-inner">
            <div className="step-head">
              <div className="step-eyebrow">{step.eyebrow}</div>
              <h1 className="step-title">{step.title}</h1>
              <p className="step-desc">{step.desc}</p>
            </div>

            <Component onJump={go} />

            <div className="step-footer">
              <button
                className="btn btn-ghost"
                onClick={back}
                disabled={index === 0}
              >
                <ArrowLeft />
                Back
              </button>
              {index < STEPS.length - 1 ? (
                <button className="btn btn-primary" onClick={next}>
                  Next
                  <ArrowRight />
                </button>
              ) : (
                <span />
              )}
            </div>
          </div>
        </div>
      </div>

      {(needsOrg || editingOrg) && (
        <OrgPrompt
          initialName={state.organization}
          initialRegion={state.region}
          initialUniqueId={state.uniqueId}
          dismissable={!needsOrg}
          onClose={() => setEditingOrg(false)}
          onSubmit={({ name, region, uniqueId }) => {
            dispatch({
              type: 'SET_IDENTITY',
              patch: { organization: name, region, uniqueId },
            })
            setEditingOrg(false)
          }}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Dashboard />
    </StoreProvider>
  )
}
