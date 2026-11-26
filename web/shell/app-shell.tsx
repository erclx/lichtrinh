import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useMatch } from 'react-router'

import { ChatDock } from '@/features/chat/chat-dock'
import { TalkBar } from '@/features/chat/talk-bar'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useOnline } from '@/offline/connection'
import { OfflineCard } from '@/offline/offline-card'
import { useSession } from '@/session/session-context'
import { visibleDestinations } from '@/shell/destinations'
import { Rail, Sidebar, Tabs } from '@/shell/nav'
import { TopBar } from '@/shell/top-bar'
import { takeRelease } from '@/update/take-release'

const navHiddenKey = 'lichtrinh.navHidden'
const chatClosedKey = 'lichtrinh.chatClosed'

// Storage can throw in a private window, where each choice opens at its
// default and still holds for the visit.
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function storeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // The choice still holds for this visit.
  }
}

/**
 * The frame around every signed-in page, owning the nav, the top bar, the
 * `main` landmark, and the gutters, plus the chat dock, sheet, and Talk bar
 * for an account that can chat. A page renders only into the outlet.
 */
export function AppShell() {
  const { user } = useSession()
  const online = useOnline()
  const [navHidden, setNavHidden] = useState(() => readFlag(navHiddenKey))
  const [chatClosed, setChatClosed] = useState(() => readFlag(chatClosedKey))
  const [sheetOpen, setSheetOpen] = useState(false)
  const hideRef = useRef<HTMLButtonElement>(null)
  const showRef = useRef<HTMLButtonElement>(null)
  const talkRef = useRef<HTMLButtonElement>(null)
  // Set only by a press, so a reload that restores the choice moves no focus.
  const focusAfterToggle = useRef(false)
  const focusTalk = useRef(false)
  const wide = useMediaQuery('(min-width: 1024px)')
  const roomy = useMediaQuery('(min-width: 480px)')
  const onChats = useMatch('/chats/*') !== null
  const onThread = useMatch('/chats/:chatId') !== null
  const { pathname } = useLocation()

  // The chat pages hold the thread, so the dock and bar stand aside there.
  const chat = user?.canChat === true && !onChats
  const dockOpen = chat && wide && !chatClosed
  const sheetShown = chat && roomy && !wide && sheetOpen

  // A new screen is a moment nobody is mid-read, so a page a touch kept on
  // the old release follows the new one here.
  useEffect(() => {
    void takeRelease()
  }, [pathname])

  useEffect(() => {
    if (!focusAfterToggle.current) return
    focusAfterToggle.current = false
    ;(navHidden ? showRef : hideRef).current?.focus()
  }, [navHidden])

  useEffect(() => {
    if (!focusTalk.current || dockOpen || sheetShown) return
    focusTalk.current = false
    talkRef.current?.focus()
  }, [dockOpen, sheetShown])

  function toggleNav(hidden: boolean) {
    focusAfterToggle.current = true
    storeFlag(navHiddenKey, hidden)
    setNavHidden(hidden)
  }

  function openChat() {
    if (wide) {
      storeFlag(chatClosedKey, false)
      setChatClosed(false)
    } else {
      setSheetOpen(true)
    }
  }

  function closeChat() {
    focusTalk.current = true
    if (wide) {
      storeFlag(chatClosedKey, true)
      setChatClosed(true)
    } else {
      setSheetOpen(false)
    }
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
            {!online && <OfflineCard />}
            <Outlet />
          </div>
        </main>
        {chat && !dockOpen && (
          <TalkBar onOpenPanel={openChat} talkRef={talkRef} />
        )}
      </div>
      {dockOpen && <ChatDock variant="dock" onClose={closeChat} />}
      {sheetShown && <ChatDock variant="sheet" onClose={closeChat} />}
      {/* Three tabs fit a 320 wide phone, so the admin reaches Accounts from
          Settings there, as the admin frames draw it. A chat's page keeps the
          foot for its composer, as the chat frames draw it. */}
      {!onThread && (
        <Tabs destinations={nav.filter(({ adminOnly }) => !adminOnly)} />
      )}
    </div>
  )
}
