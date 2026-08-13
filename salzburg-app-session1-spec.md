# Salzburg Travel Agent — Session 1 Spec

## What to build
A mobile-first AI travel agent for an 11-night Salzburg trip (Sep 15–26, 2026). Accessible to both travelers (Bar + Ori) from their own phones — shared trip data, shared chat history. The main interface is a chat — you talk to it like a travel agent who knows your trip inside out. You can ask it to plan your next day, feed it recommendations, tell it what you liked or didn't, and it gives you suggestions based on everything it knows about your trip so far.

The UI is secondary — keep it simple. The value is in the agent's context and reasoning.

## Tech
- React (Vite) frontend
- Claude API (claude-sonnet-4-6) for the agent
- Supabase (free tier) for shared data — trip context, recommendations, journal, and chat history all live here so both users see the same state
- No auth needed — it's a private trip tool, just deploy with an unguessable URL or add a simple PIN screen
- Deploy frontend to Vercel, Supabase handles the backend

## How it works

### The agent's context
Every message to Claude includes a system prompt with:
- Traveler profile (from `traveler-profile.md` — hard/soft requirements, past learnings, travel style)
- Trip basics: Salzburg, Sep 15–26, two adults + toddler
- Flights (see seed data below)
- Accommodation (once added)
- Booked activities / "big stones"
- A running log of recommendations you've saved
- A journal of past days: what you did, how it went, what you rated well/poorly
- Agent learnings (see below)
- Today's weather (future session — skip for now, just leave a slot in the system prompt)

This context is rebuilt from Supabase on every message so the agent always has the full picture, and both users' inputs are reflected.

### Agent learning
The agent should extract and persist insights from every conversation. When a user says something that reveals a preference, constraint, or rating, the agent saves it to a `learnings` table in Supabase. Examples:
- "The toddler loved the splash pad" → saves: `{ type: "liked", tag: "water-play", note: "toddler loved splash pad" }`
- "That restaurant had no high chair, annoying" → saves: `{ type: "requirement", tag: "high-chair", note: "verify high chair availability before recommending restaurants" }`
- "We were exhausted after two activities before lunch" → saves: `{ type: "constraint", tag: "pacing", note: "one activity per morning is the max" }`

These learnings are appended to the system prompt so the agent gets smarter over time — within this trip and potentially across future trips.

### Collaborative editing
All trip data lives in Supabase and is editable by both users:
- Either user can add/edit/remove accommodation, activities, recommendations, and journal entries
- Chat history is shared — both users see the full conversation
- Changes from one user are immediately visible to the other

### What you can do in the chat
- "What should we do tomorrow?" → agent plans a day based on your preferences, past ratings, unvisited recommendations, and what's already booked
- "Someone recommended Stiftskeller St. Peter for dinner" → agent acknowledges, saves it to recommendations
- "Today was great, the Sound of Music tour was a 4/5 but the toddler was wiped by 2pm" → agent logs it to the day journal
- "We haven't done any lake stuff yet" → agent pulls from recommendations + its own knowledge to suggest options
- "Show me my itinerary" → agent summarizes what's planned and what's open

### The agent's personality
Concise, opinionated (makes recommendations, doesn't just list options), toddler-aware (flags nap-time conflicts, travel distances, stroller-friendliness), and remembers what you told it.

## Seed data (pre-populate on first load)

### Trip profile (mutable — stored in Supabase, editable by both users)
```json
{
  "title": "Salzburg 2026",
  "startDate": "2026-09-15",
  "endDate": "2026-09-26",
  "travelers": ["Ori", "Bar", "toddler"],
  "notes": "Toddler in tow — need stroller-friendly options, nap-time awareness. We don't enjoy cooking, so restaurant/food access matters. Open to day trips within ~1hr of Salzburg."
}
```

### Traveler profile (separate file — see `src/data/traveler-profile.js`)
A static file with hard/soft requirements, past trip learnings, and travel style. Loaded into the agent's system prompt on every message. Lives as a separate file so it can be edited independently and reused across future trips. This is the single source of truth for traveler preferences — there is no Markdown copy.

### Flights
```json
[
  {
    "id": "f1",
    "direction": "outbound",
    "date": "2026-09-15",
    "departureTime": "12:00",
    "arrivalTime": "14:35",
    "from": "TLV Terminal 1",
    "to": "SZG",
    "airline": "Israir",
    "flightNumber": "6H 243"
  },
  {
    "id": "f2",
    "direction": "return",
    "date": "2026-09-26",
    "departureTime": "12:50",
    "arrivalTime": "17:25",
    "from": "SZG",
    "to": "TLV",
    "airline": "Israir",
    "flightNumber": "6H 250"
  }
]
```

### Other data (starts empty)
- `accommodation: []`
- `activities: []` — booked/reserved things pinned to specific dates
- `recommendations: []` — unscheduled suggestions with source, category (food/activity/day-trip), and optional notes
- `journal: {}` — keyed by date, each entry has: what you did, free-text notes, rating (1–5), energy level, what you want more/less of

## UI — keep it minimal

### Main screen: Chat
- Full-screen chat interface, mobile-optimized
- Messages render markdown (for when the agent formats a day plan)
- Input bar at bottom with send button

### Side panel or tab: Trip context
- A simple read-only view of your trip data: flights, accommodation, booked activities, saved recommendations
- This is for your reference, not the main interaction — the agent knows all of this already
- Include ability to manually add/edit accommodation, activities, and recommendations here

## Design
See `design-spec.md`. The design is already done in Claude Design; that file holds the tokens, screens, and patterns, plus the MCP import prompt for the canonical project. Do not make design decisions in code — implement what Claude Design produced.

Note: the design settled on **three tabs (Chat · Agenda · Saved)** rather than the "chat + one side panel" sketched under **UI** above. Follow the design.
