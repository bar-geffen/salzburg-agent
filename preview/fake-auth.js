// Stands in for src/lib/auth.js. Always signed in as Bar, so the preview lands
// straight on TripApp instead of the Google gate.
export const TRIP_MEMBERS = { 'bar@example.com': 'Bar', 'ori@example.com': 'Ori' }

export function useSession() {
  return { session: { user: { email: 'bar@example.com' } }, loading: false }
}

export const displayNameFor = () => 'Bar'
export const signInWithGoogle = async () => {}
export const signOut = async () => {}
