# Requirements

A parent traveling abroad wants to plan each day of a trip by talking in Vietnamese, without learning a calendar app, while the family sees the plan and helps with it.

Authoring guidance: the requirements standard.

This record holds at most 600 words.

## Goals

- **Plan by talking.** The traveler speaks or types a request in Vietnamese, with or without diacritics, and an assistant adds, moves, changes, or removes the matching entries, or answers questions about the plan.
- **Plan by hand.** Anyone signed in can tap a time slot and enter a title, a description, a time range, and an estimated cost without the assistant.
- **Today first.** The app opens on today, showing what is happening now, what comes next, and the day's estimated cost, or the next trip when none is under way.
- **One shared calendar.** Everyone with an account sees the same trips and entries, and sees the changes others make.
- **Any trip, one calendar.** The calendar holds many trips, each with its own dates, time zone, and currency, shown together on one calendar that can narrow to one trip.
- **Know the budget.** Estimated costs add up per day and per trip in the trip's currency, with an approximate home-currency total beside them.
- **Undo anything.** Every change, by a person or by the assistant, records who made it and can be undone.
- **Keep the conversations.** The traveler keeps a list of chats with the assistant, picks one up where it stopped, and starts a new one at will.
- **Vietnamese first.** Every screen exists in Vietnamese and English. Production opens in Vietnamese and development in English, with a toggle in both.
- **Learn safely.** A guided tutorial walks through each control, and a practice trip lets the traveler try everything without touching real plans.
- **Readable offline.** The traveler can read the last loaded plan without a connection.
- **Accurate voice.** Speech recognition is picked by measuring the candidates on the traveler's own northern Vietnamese speech, not on a vendor's claim.

## Non-goals

- A native app in an app store. The app installs from the browser to the home screen.
- Public sign-up. The admin creates every account.
- Booking, payments, or live prices. Costs are estimates the family types in.
- An assistant that changes anything beyond calendar data, such as the app's code or the machine it runs on.
- An always-on assistant. It runs on the owner's computer and is unavailable while that computer is off. Revisit when hosting it costs nothing.
- Entries mirrored into the phone's own calendar app (deferred).

## Constraints

- Nothing costs money beyond the owner's existing Claude subscription and domain, so there is no paid API key and no paid hosting tier.
- The calendar, accounts, and chat history keep working while the owner's computer is off. Only the assistant and voice depend on it.
- The repository is public. Real trips, flight details, voice recordings, and credentials never enter git, so every seed and test trip is invented.
- The traveler is not technical and uses an iPhone, so every flow works by touch and plain words, with no step that needs a terminal.
- When the assistant is unreachable, the app says so plainly and names whom to contact.
