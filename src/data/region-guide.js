// Standing research for the Salzburg region, loaded into the agent's system
// prompt on every message. This is reference the agent draws on when advising —
// it is not the trip record. Its recommendations are nobody's plan yet; the
// Supabase sections of the prompt say what's actually decided. Where it does
// mention the booked shape of the trip — the leg dates, the car — that is there
// to frame the research, and the tables are still the record. Don't copy
// confirmation numbers, prices or check-in windows in here.
//
// Deliberately opinionated: it leads with picks and rationale, and it names what
// to skip. Don't flatten it into a neutral list of options — the cuts and the
// "shorten here" points are the useful part.
//
// Where this and the traveller profile disagree, the profile wins: it's the
// long-term record of how these three actually travel, and this file is one
// trip's research under one set of assumptions.

export const REGION_GUIDE = `
Researched for: 2 adults + toddler (~17 months, walks but often carried),
Sep 15–26 2026, 11 nights, flying TLV↔SZG on Israir, self-drive throughout.
Assumptions it was built on: an early-afternoon nap in a real sleep space (the
profile's 13:00–15:00 is the operative window), Austria-only routing (no
crossing into Germany), nature-first low pace of 1–2 outings/day, ~€250/night.

### Trip shape
The three legs are settled and the first two are booked. The Accommodation
section of this prompt is the record of where, on what reference, and with which
check-in times — read those off there, not from here.
- Leg 1 — St. Gilgen / Wolfgangsee, 4 nights (Sep 15–19)
- Leg 2 — Kaprun village, 5 nights (Sep 19–24)
- Leg 3 — Salzburg city, 2 nights (Sep 24–26)

### The four days that are mostly logistics
The car is collected at SZG on arrival and returned there before the flight home,
so every leg change is a drive the family makes itself.
- Sep 15, arrival — the flight lands mid-afternoon, then the rental desk, then
  ~55 min to St. Gilgen. Groceries and the lakefront is the whole day. Don't
  propose a first-day outing.
- Sep 19, St. Gilgen → Kaprun — ~1.5 hrs via the A10 and Bischofshofen, and the
  Kaprun check-in is an afternoon window that has to be phoned ahead. One short
  stop en route is all this day holds.
- Sep 24, Kaprun → Salzburg — the Kaprun check-out is early morning, so they are
  on the road with the whole day still ahead of them and a city check-in hours
  away. Something on the way in (the Zell am See lakefront is on the route;
  Krimml is the wrong direction) beats arriving at 10am with nothing to do.
- Sep 26, departure — a midday flight with the car to return and refuel first.
  Breakfast and the road, nothing else.

### What the rental contract fixes
- Austria-only is contractual now, not just a preference: crossing into Germany
  needs written confirmation from the rental company. That keeps Berchtesgaden
  and Königssee cut, and it also rules out the "kleines deutsches Eck" shortcut
  between Salzburg and the Pinzgau — route through Austria on the A10 instead.
- No GPS in the booking (it's a €170 add-on), so assume phone navigation, and
  mention offline maps for any drive that loses signal — the Grossglockner road
  and the upper Pinzgau valleys especially.
- Fuel is full-to-full: the last morning needs a fill-up near the airport in it.
- One named driver (Ori), so "swap driving" is not an option on a long day out.

### Accommodation principles
- Hard filter: a physically separate, enclosed, dark bedroom — an apartment or a
  hotel suite with a genuinely separate bedroom. A standard hotel double does not
  qualify. Exclude those before surfacing them; don't offer one with a caveat.
- Visit vs. stay: the tourist hotspots (Hallstatt, Zell am See town, St. Wolfgang)
  are fine to visit and wrong to sleep in. Base in the quieter functional villages
  next door.
- Kaprun over Flachau: Flachau's cable car drops to 4 days/week after Sep 6, there's
  no lake, and the scenery overlaps.
- Zell am See town is ruled out as a base — tourist-drag energy, shops shut at 17:00.

### Leg 1 — St. Gilgen / Wolfgangsee

Sights:
- Zwölferhorn cable car from St. Gilgen — 15 min ride, station in the village. Take
  it on a clear morning and be back before the nap.
- Wolfgangsee boat to St. Wolfgang — 45 min each way; the village is the day trip.
  Skip the Schafbergbahn cog railway: too long, and altitude this age doesn't need.
- Mondsee — 30 min drive. Sound of Music church, a small pedestrian centre, a lake
  promenade. An easy half-day.
- St. Gilgen lakefront playground — by the boat dock. The default late-afternoon spot.
- Fuschlsee — the quieter alternative to Wolfgangsee. Flat lake path, stroller-friendly loop.

Hikes (carrier-friendly, ≤7km, each with a bail-out):
- Zwölferhorn Panorama Circuit — gondola up, ~4km flat loop, hut at the top. The best
  short mountain hike in the area for this age. Shorten: turn back at the first meadow (~1km).
- St. Gilgen → Fürberg lakeside path — ~5km one-way along the shore to Gasthaus Fürberg.
  Bail-out: ferry back from the Fürberg dock.
- Falkenstein pilgrim path, partial — the St. Gilgen → Fürberg segment (~5km, 200m).
  Do not continue to St. Wolfgang (8.9km plus a climb); take the ferry back.
- Fuschlsee northern shore — flat, forested, turn back anywhere. Aim for 5–6km
  out-and-back; the full loop is 11km, so don't.
- Bürgl Panoramaweg from Strobl — 4.8km easy loop on wooden walkways around the rock.
  Very carrier-friendly.

### Leg 2 — Kaprun / Zell am See

Sights:
- Sigmund-Thun-Klamm gorge walk from Kaprun village — ~1hr loop on wooden walkways.
  Carrier only, not a stroller. Spectacular, and it's on the doorstep.
- Zell am See lakefront + Elisabethpark — flat promenade, playground, boat rentals.
  The easy default day.
- Maiskogel cable car from Kaprun — the better toddler choice over the Kitzsteinhorn.
  Meadows, easy walks, alpine coaster nearby.
- Kitzsteinhorn glacier — the 3,029m top station is too high for a toddler
  (irritability, disrupted sleep, AMS risk). Stop at the Alpincenter (2,450m): still
  glacier views and snow to touch, at a manageable altitude. Keep it under an hour up there.
- Krimml Waterfalls — the lower section is stroller-friendly on paved path. Don't attempt
  the full ascent. ~1hr drive each way, so save it for good weather.
- Grossglockner High Alpine Road — one dedicated day, planned as a drive with stops
  (Edelweiss Spitze, Fuscher Törl), not as hikes. Time it so he sleeps through the switchbacks.

Hikes:
- Maiskogel Hut Tour — the best mountain hike of the trip. MK Maiskogelbahn from Kaprun
  to 1,570m, then a pram-friendly path: Unterbergalm → Glocknerblick → Maiskogel Alm.
  ~5–6km loop, gentle, several hut stops, cable car back down.
- Sigmund-Thun-Klamm + Klammsee loop — the gorge walkway plus the easy lake loop above it.
  ~4.5km total, 1.5–2.5hr. Carrier essential in the gorge.
- Kapruner Loop — ~5km circular from Kaprun village, above the town, with Zeller See and
  Kitzsteinhorn views. No cable car needed, so it's the good option when the weather clears.
- Zeller See lakeside walk — the Zell am See → Thumersbach segment is flat and
  stroller/carrier-friendly, with beaches and cafés. 5–7km one-way, boat or bus back.
  Don't do the full 11km loop.
- Kitzsteinhorn Alpincenter glacier moraine loop — ~30 min circular from the Alpincenter
  (2,450m). Short by design; pair it with the cable-car visit and keep the whole thing
  under an hour at altitude.
- Sisi circular trail (Schmittenhöhe) — easy top-of-cable-car loop, panoramic, ~2–3km.
  A good add-on if you're already up there.

### Leg 3 — Salzburg city

Where they sleep here is the one leg that was still open when this was written —
check the Accommodation section before assuming either way. Rupertikirtag, the
city's folk festival, runs Sep 23–27 across the Altstadt squares, which is the
argument for staying just outside the old town (Nonntal, Riedenburg, Itzling —
all a walk or a short bus in) rather than on it, and for doing the Altstadt early
in the day. As an outing it's mixed: fairground rides and food stalls, but
evening crowds and noise that run well past his bedtime.

Sights:
- Mirabell Gardens — free, stroller-perfect, iconic. 30 min.
- Hohensalzburg Fortress — funicular up, walk the ramparts, come down. Skip the
  interior museums.
- Salzburg Zoo (Hellbrunn) — one of the best toddler activities in the region. Small,
  walkable, open enclosures. Half a day.
- Hellbrunn trick fountains — skip unless it's unseasonably warm. Late-September water
  is cold and the tours are timed and guided.
- Getreidegasse + Altstadt stroll — 1–2 hrs at most. The cobblestones are rough on a
  stroller; use the carrier.

Hiking here: the Mönchsberg / Kapuzinerberg forested paths above the old town are 3–5km
carrier-fine loops with fortress views (stroller-difficult). Realistically, two nights
are better spent on the sights above.

### Cut from the usual Salzburg lists
- Sound of Music bus tour — too long, toddler-hostile.
- Salzbergwerk salt mines — realistically age 4+.
- DomQuartier museums — not toddler-appropriate.
- Schafbergbahn cog railway (Leg 1) — too long, altitude this age doesn't need.
- The full Kitzsteinhorn summit (Leg 2) — altitude risk; stop at the Alpincenter.
- Berchtesgaden / Königssee — Austria-only routing, not even in transit. The
  rental contract now makes this a hard no rather than a preference.

### How to use this guide
- Lead with a clear pick and the reason for it, not a neutral menu.
- Give every hike a natural shorten / turn-back point, usually 1–2km in, rather than a
  fixed distance target.
- Be honest about red flags in reviews — deposit disputes, ambiguous layouts. A polished
  shortlist is less useful than an honest one.
- For anything geographic, orient on the map first, then get into the detail.
`.trim()
