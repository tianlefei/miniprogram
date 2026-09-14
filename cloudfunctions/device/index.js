// 云函数：device
// 设备数据与订阅提醒配置的服务端读写入口（集中处理 openid 归属，客户端无需直连数据库）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DEVICE_COLLECTION = 'devices'
const PUSH_COLLECTION = 'device_push'
const PAGE_SIZE = 100

let collectionsEnsured = false

// 首次调用时自动创建所需集合，免去手动建表
async function ensureCollections() {
  if (collectionsEnsured) return
  const names = [DEVICE_COLLECTION, PUSH_COLLECTION, 'maintenance_records', 'user_profiles']
  for (let i = 0; i < names.length; i++) {
    try {
      await db.createCollection(names[i])
    } catch (e) {
      // 集合已存在时会抛出异常，忽略即可
    }
  }
  collectionsEnsured = true
}

// 规整客户端传入的设备数据
function normalizeDevice(input) {
  const item = Object.assign({}, input || {})
  const localId = item.id || item.localId || ''
  delete item.id
  delete item._id
  delete item._openid
  delete item.localId
  delete item.ownerOpenid
  delete item.dirty
  delete item.status
  delete item.percent
  delete item.daysText
  delete item.lifespanText
  delete item.updatedAtText
  return { localId: localId, data: item }
}

// 按 localId 覆盖写或新增
async function upsertDevice(openid, input) {
  const normalized = normalizeDevice(input)
  if (!normalized.localId) return false

  const data = Object.assign({}, normalized.data, {
    localId: normalized.localId
  })
  if (!data.updatedAt) data.updatedAt = Date.now()

  const existing = await db
    .collection(DEVICE_COLLECTION)
    .where({ _openid: openid, localId: normalized.localId })
    .limit(1)
    .get()

  if (!data.creatorOpenid) data.creatorOpenid = existing.data.length ? (existing.data[0].creatorOpenid || existing.data[0]._openid) : openid
  if (!data.creatorName) {
    const profile = await db.collection('user_profiles').where({ _openid: data.creatorOpenid }).limit(1).get()
    data.creatorName = profile.data.length ? String(profile.data[0].name || '') : ''
  }

  if (existing.data.length) {
    await db
      .collection(DEVICE_COLLECTION)
      .doc(existing.data[0]._id)
      .update({ data: data })
  } else {
    await db
      .collection(DEVICE_COLLECTION)
      .add({ data: Object.assign({ _openid: openid }, data) })
  }
  return true
}

async function findPush(openid) {
  const res = await db
    .collection(PUSH_COLLECTION)
    .where({ _openid: openid })
    .limit(1)
    .get()
  return res.data.length ? res.data[0] : null
}

// 普通成员只能看自己的设备；团队负责人可查看本团队所有成员的设备。
async function readableOwners(openid) {
  const owners = [openid]
  try {
    const managed = await db.collection('team_members').where({ _openid: openid, role: 'owner' }).get()
    const teamIds = (managed.data || []).map(function (m) { return m.teamId })
    if (teamIds.length) {
      const members = await db.collection('team_members').where({ teamId: _.in(teamIds) }).get()
      ;(members.data || []).forEach(function (m) {
        if (m._openid && owners.indexOf(m._openid) < 0) owners.push(m._openid)
      })
    }
  } catch (e) {}
  return owners
}

exports.main = async function (event) {
  await ensureCollections()

  const openid = cloud.getWXContext().OPENID
  const action = event && event.action
  if (action === 'profileGet') {
    const res = await db.collection('user_profiles').where({ _openid: openid }).limit(1).get()
    return { profile: res.data[0] || null }
  }
  if (action === 'profileSave') {
    const name = String(event.name || '').trim()
    if (!name) return { ok: false, error: 'name-required' }
    const old = await db.collection('user_profiles').where({ _openid: openid }).limit(1).get()
    if (old.data.length) await db.collection('user_profiles').doc(old.data[0]._id).update({ data: { name: name, updatedAt: Date.now() } })
    else await db.collection('user_profiles').add({ data: { _openid: openid, name: name, updatedAt: Date.now() } })
    return { ok: true, name: name }
  }

  // 拉取当前用户全部设备
  if (action === 'list') {
    const ownerIds = await readableOwners(openid)
    const all = []
    let skip = 0
    while (true) {
      const res = await db
        .collection(DEVICE_COLLECTION)
        .where({ _openid: _.in(ownerIds) })
        .orderBy('updatedAt', 'desc')
        .skip(skip)
        .limit(PAGE_SIZE)
        .get()
      const data = res.data || []
      for (let i = 0; i < data.length; i++) all.push(data[i])
      if (data.length < PAGE_SIZE) break
      skip += PAGE_SIZE
    }
    const profileIds = all.map(function (d) { return d.creatorOpenid || d._openid }).filter(Boolean)
    const profileRes = profileIds.length ? await db.collection('user_profiles').where({ _openid: _.in(profileIds) }).get() : { data: [] }
    const profileNames = {}
    ;(profileRes.data || []).forEach(function (p) { profileNames[p._openid] = p.name })
    return { list: all.map(function (d) {
      const creatorOpenid = d.creatorOpenid || d._openid
      return Object.assign({}, d, {
        creatorOpenid: creatorOpenid,
        creatorName: profileNames[creatorOpenid] || d.creatorName || ''
      })
    }) }
  }

  if (action === 'maintenanceList') {
    const ownerIds = await readableOwners(openid)
    const visibleDevice = await db.collection(DEVICE_COLLECTION).where({ _openid: _.in(ownerIds), localId: event.deviceId }).limit(1).get()
    if (!visibleDevice.data.length) return { list: [], error: 'device-not-readable' }
    const res = await db.collection('maintenance_records').where({ deviceId: event.deviceId }).orderBy('recordAt', 'desc').get()
    const list = res.data || []
    const ids = list.map(function (r) { return r.operatorOpenid || r._openid }).filter(Boolean)
    const profiles = ids.length ? await db.collection('user_profiles').where({ _openid: _.in(ids) }).get() : { data: [] }
    const names = {}
    ;(profiles.data || []).forEach(function (p) { names[p._openid] = p.name })
    return { list: list.map(function (r) { return Object.assign({}, r, { operatorName: r.operatorName || names[r.operatorOpenid || r._openid] || '' }) }) }
  }

  if (action === 'maintenanceAdd') {
    let operatorName = String((event.record && event.record.operatorName) || '').trim()
    if (!operatorName) {
      const profile = await db.collection('user_profiles').where({ _openid: openid }).limit(1).get()
      operatorName = profile.data.length ? String(profile.data[0].name || '').trim() : ''
    }
    if (!operatorName) return { ok: false, error: 'operator-name-required' }
    const record = Object.assign({}, event.record || {}, { _openid: openid, operatorOpenid: openid, operatorName: operatorName, deviceId: event.deviceId, recordAt: event.recordAt || Date.now(), createdAt: Date.now() })
    delete record.operator
    delete record._id
    const result = await db.collection('maintenance_records').add({ data: record })
    return { ok: true, id: result._id }
  }

  // 批量新增 / 更新
  if (action === 'upsertMany') {
    const list = (event.devices || []).slice(0, 100)
    let count = 0
    for (let i = 0; i < list.length; i++) {
      if (list[i].ownerOpenid && list[i].ownerOpenid !== openid) continue
      const ok = await upsertDevice(openid, list[i])
      if (ok) count += 1
    }
    return { ok: true, count: count }
  }

  // 物理删除（按 localId）
  if (action === 'remove') {
    const localId = event.localId || event.id
    if (!localId) return { ok: false, error: 'missing-id' }
    const found = await db
      .collection(DEVICE_COLLECTION)
      .where({ _openid: openid, localId: localId })
      .limit(1)
      .get()
    if (found.data.length) {
      await db.collection(DEVICE_COLLECTION).doc(found.data[0]._id).remove()
    }
    return { ok: true }
  }

  // 读取订阅提醒配置
  if (action === 'getPush') {
    return { config: await findPush(openid) }
  }

  // 更新订阅提醒配置（如提前提醒天数）
  if (action === 'updatePush') {
    const patch = Object.assign({}, event.patch || {})
    delete patch._id
    delete patch._openid
    const existing = await findPush(openid)
    if (existing) {
      await db
        .collection(PUSH_COLLECTION)
        .doc(existing._id)
        .update({ data: Object.assign({}, patch, { updatedAt: Date.now() }) })
    } else {
      await db.collection(PUSH_COLLECTION).add({
        data: Object.assign(
          { enabled: false, credits: 0, advanceDays: 30 },
          patch,
          { _openid: openid, updatedAt: Date.now() }
        )
      })
    }
    return { ok: true }
  }

  // 用户授权成功后累加可下发次数（一次性订阅：同意一次 = 可下发一次）
  if (action === 'addPushCredits') {
    const count = Number(event.count) || 0
    const advanceDays = Number(event.advanceDays) || 30
    const existing = await findPush(openid)
    if (existing) {
      await db
        .collection(PUSH_COLLECTION)
        .doc(existing._id)
        .update({
          data: {
            credits: _.inc(count),
            enabled: true,
            advanceDays: advanceDays || existing.advanceDays || 30,
            updatedAt: Date.now()
          }
        })
    } else {
      await db.collection(PUSH_COLLECTION).add({
        data: {
          credits: count,
          enabled: true,
          advanceDays: advanceDays,
          _openid: openid,
          updatedAt: Date.now()
        }
      })
    }
    return { ok: true }
  }

  return { error: 'unknown-action' }
}
