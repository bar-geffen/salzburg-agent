// This is loaded into the agent's system prompt on every message.
// Edit this file to update long-term preferences that apply across all trips.

export const TRAVELER_PROFILE = `
## Travelers
- Bar (parent)
- Ori (parent)
- Amir (~17 months old at time of trip)

## Hard requirements (non-negotiable)
- Snack around 10am — always overpack on snacks (this has worked well)
- Amir needs a proper lunch between 12:00–14:00 (noon is ideal, don't push past 14:00)
- Nap hits ~13:00–15:00 — if the morning was a big outing, afternoon is low-key (playgrounds, downtime, wandering). If morning was chill, afternoon can be more active. Balance across the day is the rule, not "afternoons = off."
- We cook easy stuff (pasta, rice, omelettes, salads) — breakfast is typically in the apartment, and we're fine with apartment lunch/dinner sometimes too. But we don't want to be planning elaborate meals — restaurants, takeaway, or simple home cooking.
- Accommodation must have baby infrastructure: cot, high chair

## Soft requirements (strong preferences)
- Big outings are morning activities — typically leave 8:30–9am, aim to wrap up by noon. Can leave earlier if needed but prefer not to feel rushed.
- 3.5-hour door-to-door excursion is the sweet spot
- Single-base with day trips > hopping between cities
- Amir can sleep in car or carrier, so transit during nap is fine — the hard constraint is lunch timing, not travel
- Prefer outdoor/nature over museums (with toddler)
- Outdoor space at accommodation is a big plus — private (garden, terrace) or public (shared grounds, nearby park)

## What's worked well on past trips
- Lunch around noon — either picnic-style or at a toddler-friendly restaurant
- Amir naps in the carrier (while hiking) or in the car — but needs at least 1 hour of sleep
- Days/places where one parent can rest while the other takes the toddler to a playground or similar — taking turns is key
- Food preferences: Italian works well; we prefer chicken over beef, slightly healthier options. Heavy/rich regional cuisines don't work for us (e.g. Savoyard fondue, raclette, cheese-and-ham-heavy menus). The agent should steer toward lighter, fresher options when recommending restaurants.
- On hike days, having a proper sit-down lunch spot mid-hike — either a café/restaurant or a comfortable shaded picnic area

## What hasn't worked
- Not cross-validating opening times — arrived at destinations that were closed or required advance booking we didn't know about. Agent should always verify hours and booking requirements before recommending.
- Hiking trails with too much ascent or too exposed to sun — need shade and moderate elevation
- Too many consecutive intense days (e.g. back-to-back carrier hikes) — parents need recovery days in between

## Vibe / travel style
- We like hiking but keep it moderate: 4–8 km/day (8 km is a soft cap — can push it if the trail is easy). We're not adventurous hikers.
- Balance is the ultimate key — mix hiking days with chill days. We're happy to spend an afternoon at a pool or kids' play area. Don't mind spending a bit more if it's worth it.
- We follow Amir's schedule: wake 6:30–7:30am, breakfast, start the day 8:30–9am. Dinner by 6–6:30pm, Amir down by 8–9pm.
- 3–5pm is almost always "outside time" — even if it's just an hour out, a playground visit, or grocery shopping. Not a time to be stuck indoors.
`.trim()
