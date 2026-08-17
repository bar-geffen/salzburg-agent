// The other half of the blank-page insurance in index.html.
//
// That script covers failures *before* React mounts. This covers failures after:
// an uncaught throw during render unmounts the whole tree, so one bad row shape
// from Supabase in Agenda or Saved would otherwise leave the same white page
// with the reason only in a console nobody can open on a phone.
//
// A class component because that is still the only way to implement
// componentDidCatch — there is no hook equivalent.

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Render failed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="gate">
        <h1 className="gate-title">Something broke</h1>
        <p className="gate-sub">
          The page hit an error it couldn't recover from. Reloading usually clears it.
        </p>
        <pre className="crash-detail">{this.state.error.message || String(this.state.error)}</pre>
        <div className="gate-buttons">
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
