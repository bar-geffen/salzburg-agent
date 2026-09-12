// Stands in for src/lib/use-trip-data.js. Enough of each table to draw every
// card: both recommendation states, all three category pills, a booked and a
// planned activity, both flights, and a packing list with ticked and unticked
// rows in more than one category.
//
// The mutations are no-ops. Keep / Not this one / the checkbox will all
// appear to do nothing — that's the harness, not the app.

const rec = (id, name, category, status, notes) => ({
  id,
  name,
  category,
  status,
  notes,
  location: null,
  source: 'Ori’s chat',
  created_at: new Date().toISOString(),
})

const pack = (id, name, category, packed, addedBy) => ({
  id,
  name,
  category,
  packed,
  added_by: addedBy,
  packed_by: packed ? 'Bar' : null,
})

export function useTripData() {
  return {
    trip: {
      id: 't',
      title: 'Salzburg 2026',
      start_date: '2026-09-15',
      end_date: '2026-09-26',
      notes: 'Car booked — Austria-only routing.',
    },
    activities: [
      { id: 'a1111111', date: '2026-09-16', time: '09:30', name: 'Wolfgangsee lakefront', status: 'planned', location: 'St. Gilgen', notes: 'Playground at the far end' },
      { id: 'a2222222', date: '2026-09-16', time: '12:15', name: 'Lunch at the apartment', status: 'planned', location: null, notes: null },
      { id: 'a3333333', date: '2026-09-17', time: '08:45', name: 'Zwölferhorn cable car', status: 'booked', location: 'St. Gilgen', notes: 'Turn back at the saddle' },
    ],
    accommodation: [
      { id: 'c1', name: 'Haus Bergblick', check_in: '2026-09-15', check_out: '2026-09-19', status: 'booked', address: 'St. Gilgen', notes: 'Cot and high chair confirmed' },
    ],
    flights: [
      { id: 'f1', direction: 'outbound', date: '2026-09-15', from_airport: 'TLV', to_airport: 'SZG', flight_number: '6H 671', departure_time: '10:05', arrival_time: '13:20' },
      { id: 'f2', direction: 'return', date: '2026-09-26', from_airport: 'SZG', to_airport: 'TLV', flight_number: '6H 672', departure_time: '14:10', arrival_time: '19:05' },
    ],
    journal: [],
    learnings: [
      {
        id: 'l1',
        type: 'preference',
        tag: 'city-green-space',
        note: 'On city days they want easy central green space, not another indoor sight.',
        source_message: 'I think Mirabell Gardens is a good idea on the Salzburg day',
        created_at: '2026-09-10T09:12:00Z',
        updated_at: '2026-09-10T09:12:00Z',
      },
      {
        id: 'l2',
        type: 'constraint',
        tag: 'pacing',
        note: 'One big outing before lunch, then nothing that needs a plan.',
        source_message: 'we were wiped after two things before lunch',
        created_at: '2026-09-08T18:40:00Z',
        updated_at: '2026-09-08T18:40:00Z',
      },
      {
        id: 'l3',
        type: 'requirement',
        tag: 'high-chair',
        note: 'Check for a high chair before recommending anywhere to eat.',
        source_message: null,
        created_at: '2026-09-05T12:00:00Z',
        updated_at: '2026-09-05T12:00:00Z',
      },
    ],
    recommendations: [
      rec('r1', 'Sacher terrace', 'food', 'pending', 'Ori asked about cake with a view.'),
      rec('r2', 'Haus der Natur', 'activity', 'pending', 'Toddler water room, level 2.'),
      rec('r3', 'Café Tomaselli', 'food', 'kept', 'Rainy-morning cake stop. Stroller room upstairs.'),
      rec('r4', 'Hallstatt', 'day-trip', 'kept', '1h20 drive. Leave before 08:00 to beat the buses.'),
      rec('r5', 'Mirabell playground', 'activity', 'kept', 'Shaded, fenced, 8 min from the apartment.'),
    ],
    packing: [
      pack('g1', 'Rain shells × 3', 'hiking-gear', false, 'Bar'),
      pack('g2', 'Carrier', 'hiking-gear', true, 'Bar'),
      pack('g3', 'Swim nappies', 'amir-diapers', false, 'agent'),
      pack('g4', 'Car seat', 'practical', true, 'Bar'),
      pack('g5', 'Sun hats', 'hiking-gear', false, 'Bar'),
    ],
    loading: false,
    error: '',
    refreshing: false,
    refreshAll() {},
    refreshTable() {},
    keepJournal() {},
    saveJournal() {},
    keepRec() {},
    rejectRec() {},
    forgetLearned() {},
    setPacked() {},
    addPacking() {},
    removePacking() {},
  }
}
