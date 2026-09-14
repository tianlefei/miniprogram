const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

let initialized = false
async function ensureCollections() {
  if (initialized) return
  for (const name of ['teams', 'team_members']) {
    try { await db.createCollection(name) } catch (e) {}
  }
  initialized = true
}

function code() { return Math.random().toString(36).slice(2, 8).toUpperCase() }

exports.main = async function (event) {
  await ensureCollections()
  const openid = cloud.getWXContext().OPENID
  const teams = db.collection('teams')
  const members = db.collection('team_members')
  const action = event && event.action
  if (action === 'create') {
    const existingMembership = await members.where({ _openid: openid }).limit(1).get()
    if (existingMembership.data.length) return { ok: false, error: 'only-user-without-team-can-create' }
    const inviteCode = code()
    const r = await teams.add({ data: { name: event.name || '我的团队', inviteCode: inviteCode, ownerOpenid: openid, createdAt: Date.now() } })
    await members.add({ data: { teamId: r._id, _openid: openid, role: 'owner', createdAt: Date.now() } })
    return { teamId: r._id, inviteCode: inviteCode }
  }
  if (action === 'join') {
    const res = await teams.where({ inviteCode: String(event.inviteCode || '').toUpperCase() }).limit(1).get()
    if (!res.data.length) return { ok: false, error: 'invalid-invite-code' }
    const teamId = res.data[0]._id
    const exists = await members.where({ teamId: teamId, _openid: openid }).limit(1).get()
    if (!exists.data.length) await members.add({ data: { teamId: teamId, _openid: openid, role: 'member', createdAt: Date.now() } })
    return { ok: true, teamId: teamId }
  }
  if (action === 'list') {
    const ms = await members.where({ _openid: openid }).get()
    const ids = ms.data.map(function (m) { return m.teamId })
    if (!ids.length) return { teams: [], members: [] }
    const ts = await teams.where({ _id: _.in(ids) }).get()
    const all = await members.where({ teamId: _.in(ids) }).get()
    return { teams: ts.data, members: all.data }
  }
  return { ok: false, error: 'unknown-action' }
}
