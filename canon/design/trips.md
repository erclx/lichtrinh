---
title: Trips
description: The trip list, one trip's overview, creating a trip, and the week and month calendars
---

# Trips

Row v01.3 builds these screens. These frames are a reference, and where that row's plan differs from a frame, the plan wins.

English dates follow `Intl` in the build, as 9/20, 9/20/2031, and Mon to Sun, where the English frames draw 20/9, 20/9/2031, and Mo to Su.

## Code

- `src/features/trips/trip-list.tsx`: the trips list, each card with its span, its status, and its trip-currency total
- `src/features/trips/trip-form.tsx`: the new trip form, its name, dates, local time, and both currencies
- `src/features/trips/trip-overview.tsx`: the overview card and each day with its kind dots and cost
- `src/components/no-trips.tsx`: the empty calendar the list shows with no trip, drawn in `onboarding/`
- `src/components/date-range-sheet.tsx`: the Trip dates range sheet setting From and To together
- `src/components/sheet-list.tsx`: the local time and currency choices
- `src/lib/month-cells.ts`: the Monday-first month the range sheet and the calendar both lay out
- `src/features/calendar/calendar-screen.tsx`: the Calendar tab, its Month, Week, and Day control, and the Day view
- `src/features/calendar/month-grid.tsx`: the month, each trip's days on a neutral band, a dot on a day with entries
- `src/features/calendar/week-rows.tsx`: the week as seven rows, each trip's run of days on one band
- `src/features/calendar/trip-filter.tsx`: the All trips and per-trip chips

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- The list, an overview, and the create sheet
- The create sheet with the Trip dates range sheet open
- The week and month calendars
