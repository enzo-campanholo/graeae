// PROTOTYPE. Throwaway. All state in memory, all streams fake.
// Question: what does a member see and do from opening the URL to watching and sharing?
// Three variants of the room, switchable via ?variant=A|B|C.

export type Kind = 'screen' | 'webcam'
export type Surface = 'tab' | 'window' | 'screen'
export type Share = {
  id: string
  memberId: string
  kind: Kind
  label: string
  audio: boolean
  surface?: Surface
  notice?: string
  silenced?: boolean // I had audio and switched it off after starting
}
export type Member = { id: string; name: string; present: boolean; hue: number }

export const ME = 'me'
const q = new URLSearchParams(location.search)

export const VARIANTS = [
  { key: 'D', name: 'People sidebar' },
  { key: 'A', name: 'Sidebar and grid' },
  { key: 'C', name: 'Stage and dock' },
]

const CATALOG: Record<string, Share[]> = {
  rafa: [
    { id: 'rafa-screen', memberId: 'rafa', kind: 'screen', label: 'Hades II', audio: true, surface: 'window' },
    { id: 'rafa-webcam', memberId: 'rafa', kind: 'webcam', label: 'Webcam', audio: false },
  ],
  bia: [
    { id: 'bia-screen', memberId: 'bia', kind: 'screen', label: 'YouTube tab', audio: true, surface: 'tab' },
    { id: 'bia-webcam', memberId: 'bia', kind: 'webcam', label: 'Webcam', audio: false },
  ],
  caio: [
    { id: 'caio-screen', memberId: 'caio', kind: 'screen', label: 'Whole screen', audio: false, surface: 'screen' },
    { id: 'caio-webcam', memberId: 'caio', kind: 'webcam', label: 'Webcam', audio: false },
  ],
  duda: [
    { id: 'duda-screen', memberId: 'duda', kind: 'screen', label: 'Factorio', audio: true, surface: 'window' },
    { id: 'duda-webcam', memberId: 'duda', kind: 'webcam', label: 'Webcam', audio: false },
  ],
}
export const catalog = CATALOG

export const proto = $state({
  variant: q.get('variant') ?? 'D',
  rooms: Number(q.get('rooms') ?? 1), // 1 or 3: how many rooms this member has access to
  browser: (q.get('browser') ?? 'chromium') as 'chromium' | 'firefox',
  flow: (q.get('flow') ?? 'direct') as 'dialog' | 'direct', // direct: tips once, then always straight to the browser picker
  tipsSeen: false, // stands in for 'this device has shared a screen before'
  sidebar: true,
  room: null as string | null,
  members: [
    { id: ME, name: 'You', present: true, hue: 210 },
    { id: 'rafa', name: 'Rafa', present: true, hue: 20 },
    { id: 'bia', name: 'Bia', present: true, hue: 300 },
    { id: 'caio', name: 'Caio', present: true, hue: 140 },
    { id: 'duda', name: 'Duda', present: false, hue: 60 },
    { id: 'lia', name: 'Lia', present: false, hue: 180 },
    { id: 'teo', name: 'Teo', present: false, hue: 260 },
  ] as Member[],
  shares: [CATALOG.rafa[0], CATALOG.rafa[1], CATALOG.bia[0], CATALOG.caio[1]] as Share[],
  watched: {} as Record<string, { volume: number; muted: boolean }>,
  focused: null as string | null,
  // metrics
  openedAt: Date.now(),
  clicks: 0,
  firstWatch: null as null | { clicks: number; secs: number },
  firstShare: null as null | { clicks: number; secs: number },
})

export const ROOMS = [
  { id: 'os-guris', name: 'Os guris', present: ['Rafa', 'Bia', 'Caio'], live: 4 },
  { id: 'trabalho', name: 'Trabalho', present: [], live: 0 },
  { id: 'rpg', name: 'RPG de quinta', present: ['Lia'], live: 1 },
]
if (proto.rooms === 1) proto.room = ROOMS[0].id

export const member = (id: string) => proto.members.find((m) => m.id === id)!
export const sharesOf = (id: string) => proto.shares.filter((s) => s.memberId === id)
export const others = () => proto.shares.filter((s) => s.memberId !== ME)
export const mine = () => proto.shares.filter((s) => s.memberId === ME)
export const watchedShares = () => proto.shares.filter((s) => proto.watched[s.id])
export const isWatched = (id: string) => !!proto.watched[id]
export const title = (s: Share) =>
  `${member(s.memberId).name} · ${s.kind === 'webcam' ? 'webcam' : s.label}`
// who is watching my shares (faked: present members, fewer for the webcam)
export const watchersOf = (s: Share) =>
  proto.members
    .filter((m) => m.present && m.id !== ME)
    .slice(0, s.kind === 'screen' ? 2 : 1)
    .map((m) => m.name)

const stamp = () => ({
  clicks: proto.clicks,
  secs: Math.round((Date.now() - proto.openedAt) / 100) / 10,
})

export function watch(id: string) {
  if (proto.watched[id]) return
  proto.watched[id] = { volume: 80, muted: false }
  proto.firstWatch ??= stamp()
}
export function unwatch(id: string) {
  delete proto.watched[id]
  if (proto.focused === id) proto.focused = null
}
export const toggleWatch = (id: string) => (isWatched(id) ? unwatch(id) : watch(id))
export function watchAll(kind?: Kind) {
  for (const s of others()) if (!kind || s.kind === kind) watch(s.id)
}
export function watchNone() {
  for (const id of Object.keys(proto.watched)) unwatch(id)
}
export function solo(id: string) {
  for (const [k, w] of Object.entries(proto.watched)) w.muted = k !== id
}
export function focus(id: string | null) {
  proto.focused = proto.focused === id ? null : id
}

export function startShare(s: Share) {
  proto.shares.push(s)
  proto.firstShare ??= stamp()
}
export function stopShare(id: string) {
  proto.shares = proto.shares.filter((s) => s.id !== id)
  unwatch(id)
}
export function toggleFake(s: Share) {
  if (proto.shares.some((x) => x.id === s.id)) stopShare(s.id)
  else {
    member(s.memberId).present = true
    proto.shares.push(s)
  }
}
export function reopen() {
  watchNone()
  proto.shares = proto.shares.filter((s) => s.memberId !== ME)
  proto.room = proto.rooms === 1 ? ROOMS[0].id : null
  proto.clicks = 0
  proto.firstWatch = proto.firstShare = null
  proto.openedAt = Date.now()
}

// rough downlink the current selection would pull: 10 Mbps a screen, 2 a webcam
export const downlink = () =>
  watchedShares().reduce((n, s) => n + (s.kind === 'screen' ? 10 : 2), 0)

export function gridCols(n: number) {
  return n <= 1 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : 4
}

// Clicking a name goes to that member: it replaces what I watch with everything they share.
export function switchTo(memberId: string) {
  // clicking the name of the member I already watch alone changes nothing
  const ids = sharesOf(memberId).map((s) => s.id)
  for (const id of Object.keys(proto.watched)) if (!ids.includes(id)) unwatch(id)
  ids.forEach(watch)
}
