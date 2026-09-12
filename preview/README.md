# Design preview

`npm run preview:design` — the app with fake data and no Google sign-in, so you
can look at every screen without a Supabase session. It aliases three modules to
the stubs in this folder and mounts the **real** `src/App.jsx`, so what you see is
the real header, the real components and the real CSS.

    npm run preview:design      # http://localhost:5199/preview.html

Nothing in here ships. `vite build` only ever reads `index.html`, so `preview.html`
and these stubs are never bundled.

Two things it can't exercise, because they need the network: sending a message
(the insert into `messages` and the call to `/api/chat`) and anything that writes.
Everything else — the switcher, the Chats list, the icon set, the empty state,
both tint colours, the packing checkbox — is live.

To see the pre-migration-004 fallback, where there are no sessions:

    localStorage.setItem('legacy', '1')   // in the console, then reload
    localStorage.removeItem('legacy')     // back to normal
