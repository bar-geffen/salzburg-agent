// The one place that knows about auth, the way trip-data.js is the one place
// that knows about the tables.
//
// Nothing here is a security boundary. The gate is public.is_trip_member() in
// supabase-migration-003.sql: a Google account that isn't on the list still
// authenticates successfully and gets a valid JWT, it just reads zero rows from
// every table. This module exists so the app can *say* that rather than showing
// an empty trip.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Email -> display name. Deliberately a second copy of the SQL allowlist, and
// the only one: it also carries the display names, which the database has no
// reason to know. Change an address here and in is_trip_member() together —
// changing only this one shows someone the app and then fails every query.
const TRIP_MEMBERS = {
  'bar.geffen2@gmail.com': 'Bar',
  'oriorio@gmail.com': 'Ori',
}

/**
 * 'Bar' | 'Ori' for a member, undefined for anyone else. This is what App.jsx
 * branches on for the "not on this trip" screen, and it becomes messages.sender
 * — which stays a display name, exactly as the existing rows have it.
 */
export function displayNameFor(session) {
  const email = session?.user?.email
  if (!email) return undefined
  return TRIP_MEMBERS[email.trim().toLowerCase()]
}

/**
 * The current session, plus whether we've looked yet.
 *
 * `loading` is not decoration: getSession() reads persisted storage
 * asynchronously, so without it the first paint shows the sign-in screen to
 * someone who is already signed in, and it flickers away a frame later.
 */
export function useSession() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data?.session ?? null)
      setLoading(false)
    })

    // Fires on sign-in, sign-out, and token refresh — including the redirect
    // back from Google, which supabase-js reads out of the URL fragment itself.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return
      setSession(next)
      setLoading(false)
    })

    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  return { session, loading }
}

/**
 * Sends the browser to Google. On success this never returns — the page
 * navigates away — so the only interesting outcome is the error, which is
 * usually a provider that isn't configured yet.
 */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) throw new Error(error.message || "Couldn't start sign-in.")
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message || "Couldn't sign out.")
}
