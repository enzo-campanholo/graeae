// PROTOTYPE. Throwaway. All state in memory, nothing is sent anywhere.
// Question: where in the app, and through what screens, does the owner administer the instance?
// Three variants of where the owner's screens live, switchable via ?variant=A|B|C,
// hosted on the room from the room-experience prototype (its variant D).

import { ME, ROOMS, member, proto, sharesOf, stopShare } from './state.svelte'

const q = new URLSearchParams(location.search)

export const VARIANTS = [
  { key: 'A', name: 'In the bar' },
  { key: 'B', name: 'Owner page' },
  { key: 'C', name: 'Side panel' },
]

export type Device = { id: string; browser: string; os: string; last: string; current?: boolean }
export type Invite = { id: string; name: string; rooms: string[]; link: string; expires: string; back?: string }
export type Panel = { view: 'home' | 'member' | 'invite' | 'usage' | 'rooms' | 'you'; id?: string }

export const LIVE_ROOM = 'os-guris' // the only room with faked presence
export const ORIGIN = 'https://graeae.example'
export const field = 'w-full rounded-md border bg-background px-2 py-1.5 text-sm'

let n = 0
const dev = (browser: string, os: string, last: string, current = false): Device => ({ id: `d${n++}`, browser, os, last, current })
const code = () => Math.random().toString(36).slice(2, 10)

proto.members.push({ id: 'nina', name: 'Nina', present: false, hue: 330 })

export const admin = $state({
  variant: q.get('variant') ?? 'A',
  role: (q.get('as') ?? 'owner') as 'owner' | 'member',
  page: 'room' as 'room' | 'owner' | 'you', // variant B
  ownerTab: 'people' as 'people' | 'invites' | 'rooms' | 'usage', // variant B
  panel: null as Panel | null, // variant C
  myName: 'Isa',
  rooms: ROOMS.map((r) => ({ id: r.id, name: r.name })),
  access: {
    me: ['os-guris', 'trabalho', 'rpg'],
    rafa: ['os-guris', 'rpg'],
    bia: ['os-guris', 'trabalho'],
    caio: ['os-guris'],
    duda: ['os-guris'],
    lia: ['os-guris', 'rpg'],
    teo: ['os-guris', 'trabalho'],
    nina: ['rpg'],
  } as Record<string, string[]>,
  devices: {
    me: [dev('Helium', 'Windows 11', 'now', true), dev('Firefox', 'Windows 11', '3 days ago')],
    rafa: [dev('Chrome', 'Windows 11', 'now'), dev('Chrome', 'Android', '2 months ago')],
    bia: [dev('Brave', 'Windows 11', 'now')],
    caio: [dev('Vivaldi', 'Windows 11', 'now')],
    duda: [dev('Chrome', 'Windows 11', 'yesterday'), dev('Firefox', 'Linux', '5 months ago')],
    lia: [dev('Chrome', 'macOS', '2 hours ago')],
    teo: [dev('Firefox', 'Windows 11', '3 weeks ago')],
    nina: [dev('Chrome', 'Windows 11', '6 days ago')],
  } as Record<string, Device[]>,
  invites: [
    { id: 'gabi', name: 'Gabi', rooms: ['os-guris'], link: `${ORIGIN}/i/k3v9x2pa7qmd41zt`, expires: 'in 5 days' },
  ] as Invite[],
  deviceInvite: null as null | string,
  usedGB: Number(q.get('used') ?? 420),
  budgetGB: 1000,
  resetDay: 1,
  log: [] as string[],
})

export const isOwner = () => admin.role === 'owner'
export const say = (s: string) => admin.log.unshift(s)
export const has = (m: string, r: string) => !!admin.access[m]?.includes(r)
export const roomName = (id: string) => admin.rooms.find((r) => r.id === id)?.name ?? id
export const nameOf = (id: string) => (id === ME ? `${admin.myName} (you)` : member(id).name)
export const myRooms = () => admin.rooms.filter((r) => has(ME, r.id))
export const hereIn = (id: string, roomId: string | null) => {
  const m = proto.members.find((x) => x.id === id)
  return !!m?.present && has(id, LIVE_ROOM) && (roomId === null || roomId === LIVE_ROOM)
}

// usage
export const FREE_GB = 1000
export const cost = (gb: number) => Math.max(0, gb - FREE_GB) * 0.05
export const usd = (x: number) => `$${x.toFixed(2)}`
export const pct = () => Math.round((admin.usedGB / Math.max(1, admin.budgetGB)) * 100)
export const projected = () => {
  const d = new Date().getUTCDate()
  const elapsed = d >= admin.resetDay ? d - admin.resetDay + 1 : d + 30 - admin.resetDay + 1
  return Math.round((admin.usedGB / elapsed) * 30)
}
export const stopped = () => admin.usedGB >= admin.budgetGB

export function copy(text: string) {
  try {
    navigator.clipboard?.writeText(text).catch(() => {})
  } catch {}
  say(`Copied to the clipboard: ${text}`)
}

// removal
function kick(id: string, roomId: string | null) {
  if (!hereIn(id, roomId)) return
  member(id).present = false
  for (const s of sharesOf(id)) stopShare(s.id)
}
export function consequences(id: string, roomId: string | null): string[] {
  const m = member(id)
  const live = sharesOf(id)
  const out: string[] = []
  if (hereIn(id, roomId)) {
    out.push(
      live.length
        ? `${m.name} is present and sharing ${live.map((s) => (s.kind === 'screen' ? 'a screen' : 'a webcam')).join(' and ')}. That stops for everyone within about 2 seconds.`
        : `${m.name} is present. Their page becomes "nothing here" within about 2 seconds.`,
    )
  } else out.push(`${m.name} is not here right now.`)
  if (roomId) {
    const keep = (admin.access[id] ?? []).filter((r) => r !== roomId).map(roomName)
    out.push(
      keep.length
        ? `They lose access to ${roomName(roomId)} and keep ${keep.join(', ')}.`
        : `${roomName(roomId)} is their only room. They stay a member with no room until you grant one.`,
    )
  } else {
    const k = admin.devices[id]?.length ?? 0
    out.push(`They lose every room and their ${k} ${k === 1 ? 'device is' : 'devices are'} forgotten. Coming back takes a new invite.`)
  }
  return out
}
export function removeFromRoom(id: string, roomId: string) {
  const nm = member(id).name
  kick(id, roomId)
  admin.access[id] = (admin.access[id] ?? []).filter((r) => r !== roomId)
  say(`${nm} removed from ${roomName(roomId)}.`)
}
export function grant(id: string, roomId: string) {
  admin.access[id] = [...(admin.access[id] ?? []), roomId]
  say(`${member(id).name} now has access to ${roomName(roomId)}.`)
}
export function removeFromInstance(id: string) {
  const nm = member(id).name
  kick(id, null)
  delete admin.access[id]
  delete admin.devices[id]
  admin.invites = admin.invites.filter((i) => i.back !== id)
  proto.members = proto.members.filter((m) => m.id !== id)
  say(`${nm} removed from the instance. Devices forgotten.`)
}

// invites
export function createInvite(name: string, rooms: string[], back?: string) {
  const inv: Invite = { id: code(), name, rooms, link: `${ORIGIN}/i/${code()}${code()}`, expires: 'in 7 days', back }
  admin.invites.unshift(inv)
  say(back ? `Invite to let ${name} back in created.` : `Invite for ${name} created (${rooms.map(roomName).join(', ')}).`)
  return inv
}
export function cancelInvite(id: string) {
  const inv = admin.invites.find((i) => i.id === id)
  admin.invites = admin.invites.filter((i) => i.id !== id)
  if (inv) say(`Invite for ${inv.name} cancelled. Its link now gives "nothing here".`)
}
// scenario: the invited person pressed "Join as <name>"
export function acceptInvite(id: string) {
  const inv = admin.invites.find((i) => i.id === id)
  if (!inv) return
  admin.invites = admin.invites.filter((i) => i.id !== id)
  if (inv.back) {
    admin.devices[inv.back] = [dev('Chrome', 'Windows 11', 'now')]
    say(`${inv.name} used the invite. Their previous devices are forgotten.`)
  } else {
    const mid = code()
    proto.members.push({ id: mid, name: inv.name, present: false, hue: Math.floor(Math.random() * 360) })
    admin.access[mid] = inv.rooms
    admin.devices[mid] = [dev('Chrome', 'Windows 11', 'now')]
    say(`${inv.name} pressed Join and is now a member.`)
  }
}

// devices
export function forgetDevice(memberId: string, devId: string) {
  admin.devices[memberId] = admin.devices[memberId].filter((d) => d.id !== devId)
  say(`A device of ${nameOf(memberId)} forgotten.`)
}
export function addDevice() {
  admin.deviceInvite = `${ORIGIN}/i/${code()}${code()}`
  say('Add-a-device invite shown, valid for 10 minutes.')
}

// rooms
export function renameRoom(id: string, name: string) {
  const r = admin.rooms.find((x) => x.id === id)
  if (!r || !name.trim() || r.name === name.trim()) return
  r.name = name.trim()
  say(`Room renamed to ${r.name}. Its address /${r.id} stays the same.`)
}
export function createRoom(name: string) {
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || code()
  admin.rooms.push({ id, name: name.trim() })
  admin.access[ME].push(id)
  say(`Room ${name.trim()} created at /${id}. Only you have access so far.`)
  return id
}

export function setBudget(gb: number) {
  admin.budgetGB = gb
  say(`Usage budget set to ${gb} GB a month${stopped() ? '. All watching is stopped.' : '.'}`)
}
