---
title: Web
subtitle: The browser app and its UI kit
---

# Web

The browser app and its UI kit

- [API](api.md): The Worker serving the app and the Hono API, its D1 database, and the schemas the app and the API share
- [App](app.md): The React front end, its Tailwind styling and shadcn kit, and where its tests and screenshots live
- [Budget](budget.md): A trip's estimated cost, the exchange rates the admin sets, and the home-currency figure read from them
- [Calendar data](calendar-data.md): The app's reads and writes over trips, entries, and changes, on TanStack Query, shared by every calendar screen
- [Chat](chat.md): The traveler's chats with the assistant in the browser app, from the streamed turn to the dock, the sheet, and the Talk bar
- [Offline](offline.md): The service worker, the plan saved on the device, and the card and waiting controls the app shows while it cannot reach the API
