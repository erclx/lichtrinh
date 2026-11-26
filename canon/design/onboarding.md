---
title: Onboarding
description: Signing in, installing to the home screen, the guided tutorial, the practice trip, and the first empty calendar
---

# Onboarding

Rows v01.8, v02.1, and v02.3 build these screens. These frames are a reference, and where a row's plan differs from a frame, the plan wins.

## Code

- `web/features/sign-in/sign-in-page.tsx`: sign in and the paused state, with the paused message on the muted fill
- `web/features/install/home-screen-page.tsx`: install, with the offered and done states
- `web/components/no-trips.tsx`: the empty calendar
- Not built yet: the tutorial, the practice trip, the practice list, and the tutorial in settings draw v01.8, and the plan of v01.8 names their paths

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- Sign in, and sign in locked after failed tries
- Install, install offered, and install done
- The empty calendar
- The tutorial, the practice trip and its list, and the tutorial in settings, which draw v01.8
