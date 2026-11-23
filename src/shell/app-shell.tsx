import { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router'

import { useSession } from '@/session/session-context'
import { visibleDestinations } from '@/shell/destinations'
import { Rail, Sidebar, Tabs } from '@/shell/nav'
import { TopBar } from '@/shell/top-bar'

const navHiddenKey = 'lichtrinh.navHidden'

// Storage can throw in a private window, where the nav simply opens shown.
function readNavHidden(): boolean {
  try {
    return localStorage.getItem(navHiddenKey) === 'true'
  } catch {
    return false
  }
}

function storeNavHidden(hidden: boolean) {
  try {
    localStorage.setItem(navHiddenKey, String(hidden))
  } catch {
    // The choice still holds for this visit.
  }
}

/**
 * The frame around every signed-in page. It owns the nav, the top bar, the
 * `main` landmark, and the gutters, and a page renders only its own header
 * and content into the outlet.
 */
export function AppShell() {
  const { user } = useSession()
  const [navHidden, setNavHidden] = useState(readNavHidden)
  const hideRef = useRef<HTMLButtonElement>(null)
  const showRef = useRef<HTMLButtonElement>(null)
  // Set only by a press, so a reload that restores the choice moves no focus.
  const focusAfterToggle = useRef(false)

  useEffect(() => {
    if (!focusAfterToggle.current) return
    focusAfterToggle.current = false
    ;(navHidden ? showRef : hideRef).current?.focus()
  }, [navHidden])

  function toggleNav(hidden: boolean) {
    focusAfterToggle.current = true
    storeNavHidden(hidden)
    setNavHidden(hidden)
  }

  const visible = visibleDestinations(user?.role ?? 'member')
  const nav = visible.filter(({ placement }) => placement === 'nav')
  const header = visible.find(({ placement }) => placement === 'header')

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground min-[480px]:flex-row">
      {!navHidden && (
        <Sidebar
          destinations={nav}
          onHide={() => toggleNav(true)}
          hideRef={hideRef}
        />
      )}
      <Rail destinations={nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          header={header}
          navHidden={navHidden}
          onShowNav={() => toggleNav(false)}
          showRef={showRef}
        />
        <main className="flex-1 px-4 pb-6 min-[480px]:px-8 lg:px-10">
          <div className="mx-auto w-full max-w-[760px]">
            <Outlet />
          </div>
        </main>
      </div>
      <Tabs destinations={nav} />
    </div>
  )
}
