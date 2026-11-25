// Imported by name into the built service worker, so it is plain script with no
// build step. A device can hold this version beside a Worker of another, so
// every field is optional, and Safari revokes a permission for a push that
// shows nothing, so a payload it cannot read still shows the app's name.

function readPush(event) {
  try {
    return event.data.json() ?? {}
  } catch {
    return {}
  }
}

// The device's own clock, which the sender cannot know.
function clockTime({ at, lang }) {
  try {
    return new Intl.DateTimeFormat(lang, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(at)
  } catch {
    return ''
  }
}

self.addEventListener('push', (event) => {
  const push = readPush(event)
  const title = push.title ?? 'Lịch trình'
  const words = [push.before, clockTime(push), push.after]
  event.waitUntil(
    self.registration.showNotification(title, {
      body: push.before === undefined ? '' : words.join(''),
      lang: push.lang,
      icon: '/icon-192x192.png',
      // A later notice of the same kind takes the last one's place.
      tag: title,
    }),
  )
})

// An open app comes forward as it is, so nothing typed in it is lost.
async function openApp() {
  const open = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  if (open.length > 0) return open[0].focus()
  return self.clients.openWindow('/admin/assistant')
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(openApp())
})
