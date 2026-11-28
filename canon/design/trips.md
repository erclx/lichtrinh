---
title: Trips
description: The trip list, one trip's overview, creating a trip, and the week and month calendars
---

# Trips

Row v01.3 builds these screens. These frames are a reference, and where that row's plan differs from a frame, the plan wins.

## Code

- `web/features/trips/trip-list.tsx`: the trips list, each card with its span, its status, and its trip-currency total, shown as a grid or a list through the Grid and List switch, List under 480px and Grid from 480px until the device remembers a choice
- `web/components/view-switch.tsx`: the Grid and List switch, each option an icon and its label
- `web/lib/device-choice.ts`: the layout this device remembers
- `web/features/trips/trip-form.tsx`: the new trip form, its name, dates, local time, and both currencies
- `web/features/trips/trip-overview.tsx`: the overview card and each day with its kind dots and cost
- `web/components/no-trips.tsx`: the empty calendar the list shows with no trip, drawn in `onboarding/`
- `web/components/date-range-sheet.tsx`: the Trip dates range sheet setting From and To together
- `web/components/sheet-list.tsx`: the local time and currency choices
- `web/lib/month-cells.ts`: the Monday-first month the range sheet and the calendar both lay out
- `web/features/calendar/calendar-screen.tsx`: the Calendar tab, its Month, Week, and Day control, and the Day view
- `web/features/calendar/month-grid.tsx`: the month, each trip's days on a neutral band, a dot on a day with entries
- `web/features/calendar/week-rows.tsx`: the week as seven rows, each trip's run of days on one band
- `web/features/calendar/trip-filter.tsx`: the All trips and per-trip chips

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- The list, an overview, and the create sheet
- The create sheet with the Trip dates range sheet open
- The week and month calendars, and the Calendar's day view
