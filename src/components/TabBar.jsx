// Segmented control at the top of the header. A 20px icon over an 11px label.
//
// The labels stay: four icon-only tabs aren't identifiable at this width, and
// "Saved" and "Pack" in particular are a bookmark and a bag — near-synonyms as
// pictures. The icon is recognition, the word is the answer.

import Icon from './Icon'

const TABS = [
  { id: 'chat', label: 'Chat', icon: 'bubble' },
  { id: 'agenda', label: 'Agenda', icon: 'calendar' },
  { id: 'saved', label: 'Saved', icon: 'bookmark' },
  { id: 'packing', label: 'Pack', icon: 'bag' },
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
          <Icon name={tab.icon} size={20} />
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  )
}
