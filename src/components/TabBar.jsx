// Segmented control at the top of the header. The design has no icons anywhere,
// so the active state is carried by fill, weight and a hairline shadow.

const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'saved', label: 'Saved' },
]

export default function TabBar({ value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {TABS.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          className={`tab${value === tab.id ? ' tab--on' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
