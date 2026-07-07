import { STEPS } from '../steps/index.js'

function BrandMark() {
  return (
    <div className="brand-mark">
      <span className="m-amber" />
      <span className="m-empty" />
      <span className="m-navy" />
      <span className="m-teal" />
    </div>
  )
}

export function Sidebar({ activeId, onSelect, completed }) {
  const groups = []
  for (const step of STEPS) {
    let g = groups.find((x) => x.name === step.group)
    if (!g) {
      g = { name: step.group, steps: [] }
      groups.push(g)
    }
    g.steps.push(step)
  }

  let counter = 0
  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandMark />
        <div>
          <div className="brand-name">
            Auth<b>Platform</b>
          </div>
          <div className="brand-sub">Cognito Provisioning</div>
        </div>
      </div>
      <nav className="nav-scroll">
        {groups.map((group) => (
          <div key={group.name}>
            <div className="nav-section-label">{group.name}</div>
            {group.steps.map((step) => {
              counter += 1
              const isActive = step.id === activeId
              const isDone = completed.has(step.id) && !isActive
              return (
                <button
                  key={step.id}
                  className={`nav-item ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
                  onClick={() => onSelect(step.id)}
                >
                  <span className="nav-num">{isDone ? '✓' : counter}</span>
                  <span className="nav-label">{step.label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
