// Presentation constants for the packing list. The items themselves live in
// Supabase (they're mutable trip data); what's here is the render order, the
// display labels for the category slugs, and the strategy note.
//
// PACKING_STRATEGY is read by both Packing.jsx and build-system-prompt.js, so
// the reasoning behind the list — why six days of clothes is enough, why there
// are €1 coins in the carry-on — is one string, not two that drift.

export const PACKING_CATEGORIES = [
  { id: 'carry-on', label: 'Carry-on ✈️' },
  { id: 'amir-clothes', label: 'Amir — clothes' },
  { id: 'amir-diapers', label: 'Amir — diapers & feeding' },
  { id: 'amir-medical', label: 'Amir — medical & care' },
  { id: 'ori', label: 'Ori' },
  { id: 'bar', label: 'Bar' },
  { id: 'hiking-gear', label: 'Hiking & rain gear' },
  { id: 'toiletries', label: 'Toiletries & skincare' },
  { id: 'practical', label: 'Practical / apartment' },
  { id: 'documents', label: 'Documents & money' },
  { id: 'toys-books', label: 'Toys & books' },
]

export const PACKING_STRATEGY =
  'Pack ~6 days of clothes. Coin laundry at Obernosterer (Kaprun) mid-trip — ' +
  'bring €1 coins and detergent pods. Cold alpine mornings (6–10°C), wet first ' +
  'week, near-freezing on the Kitzsteinhorn day. Layer up.'

export const categoryLabel = id =>
  PACKING_CATEGORIES.find(c => c.id === id)?.label ?? id
