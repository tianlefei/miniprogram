// utils/cloud.js
// 云开发访问封装：设备数据与订阅提醒配置均通过云函数读写，客户端不直连数据库
const config = require('./config.js')

const DEVICE_FUNCTION = 'device'

let inited = false
let available = false
let lastError = ''

// 统一错误文案，便于在界面上直接展示排查信息
function formatError(err) {
  if (!err) return '云函数调用失败'
  const code =
    err.errCode !== undefined && err.errCode !== null
      ? '[' + err.errCode + '] '
      : ''
  return code + (err.errMsg || err.message || '云函数调用失败')
}

// 初始化云开发（在 app.onLaunch 中调用一次即可）
function init() {
  if (inited) return available
  inited = true

  if (!wx.cloud) {
    available = false
    lastError = '当前基础库不支持云开发'
    return false
  }
  try {
    const opts = { traceUser: true }
    if (config.CLOUD_ENV) opts.env = config.CLOUD_ENV
    wx.cloud.init(opts)
    available = true
  } catch (e) {
    available = false
    lastError = formatError(e)
  }
  return available
}

function isAvailable() {
  return available
}

// 是否具备使用云开发的基础条件
function isEnabled() {
  return !!wx.cloud
}

function getError() {
  return lastError
}

let cachedUser = null

// 获取当前用户身份（openid），用于展示与云端数据归属
function login() {
  if (cachedUser) return Promise.resolve(cachedUser)
  if (!available) return Promise.reject(new Error('云开发未初始化'))

  let cached = null
  try {
    cached = wx.getStorageSync('cloud_user_v1')
  } catch (e) {
    cached = null
  }
  if (cached && cached.openid) {
    cachedUser = cached
    return Promise.resolve(cached)
  }

  return wx.cloud
    .callFunction({ name: 'login' })
    .then(function (res) {
      const r = (res && res.result) || {}
      const user = {
        openid: r.openid || '',
        appid: r.appid || '',
        unionid: r.unionid || ''
      }
      cachedUser = user
      lastError = ''
      try {
        wx.setStorageSync('cloud_user_v1', user)
      } catch (e) {}
      return user
    })
    .catch(function (err) {
      lastError = formatError(err)
      throw err
    })
}

/* ---------------- 云函数调用 ---------------- */

function callFunction(name, data) {
  if (!available) return Promise.reject(new Error(lastError || '云开发未初始化'))
  return wx.cloud
    .callFunction({ name: name, data: data || {} })
    .then(function (res) {
      lastError = ''
      return (res && res.result) || {}
    })
    .catch(function (err) {
      lastError = formatError(err)
      const e = new Error(lastError)
      e.errCode = err && err.errCode
      e.errMsg = lastError
      throw e
    })
}

function callDevice(action, payload) {
  return callFunction(DEVICE_FUNCTION, Object.assign({ action: action }, payload || {}))
}

// 云端记录 -> 本地记录
function fromCloud(doc) {
  const item = Object.assign({}, doc)
  item.id = doc.localId || doc._id
  item.ownerOpenid = doc._openid || ''
  delete item._id
  delete item._openid
  delete item.localId
  return item
}

// 本地记录 -> 云端记录（剔除仅用于本地展示的派生字段）
function toCloud(device) {
  const item = Object.assign({}, device)
  delete item._id
  delete item._openid
  delete item.dirty
  delete item.status
  delete item.percent
  delete item.daysText
  delete item.lifespanText
  delete item.updatedAtText
  return item
}

// 拉取当前用户全部设备
function pullDevices() {
  return callDevice('list').then(function (r) {
    return (r.list || []).map(fromCloud)
  })
}

// 批量写入，返回实际写入条数
function pushDevices(list, limit) {
  const max = limit || config.SYNC_PUSH_BATCH
  const devices = (list || []).slice(0, max).map(toCloud)
  if (!devices.length) return Promise.resolve(0)
  return callDevice('upsertMany', { devices: devices }).then(function (r) {
    return r.count || 0
  })
}

function pushDevice(device) {
  return pushDevices([device], 1)
}

function deleteDevice(localId) {
  return callDevice('remove', { localId: localId })
}

/* ---------------- 订阅提醒配置 ---------------- */

function getPushConfig() {
  return callDevice('getPush').then(function (r) {
    return r.config || null
  })
}

function addSubscribeCredits(count, advanceDays) {
  return callDevice('addPushCredits', {
    count: count,
    advanceDays: advanceDays
  })
}

function updatePushConfig(patch) {
  return callDevice('updatePush', { patch: patch })
}

function teamCall(action, data) { return callFunction('team', Object.assign({ action: action }, data || {})) }
function createTeam(name) { return teamCall('create', { name: name }) }
function joinTeam(inviteCode) { return teamCall('join', { inviteCode: inviteCode }) }
function listTeams() { return teamCall('list') }
function listMaintenance(deviceId) { return callDevice('maintenanceList', { deviceId: deviceId }) }
function addMaintenance(deviceId, record) { return callDevice('maintenanceAdd', { deviceId: deviceId, record: record }) }
function getProfile() { return callDevice('profileGet') }
function saveProfile(name) { return callDevice('profileSave', { name: name }) }

/* ---------------- 订阅消息 ---------------- */

const PUSH_STATUS_KEY = 'device_push_status_v1'

// 过滤掉未配置的占位模板 ID
function getTemplateIds() {
  return (config.SUBSCRIBE_TEMPLATE_IDS || []).filter(function (id) {
    return !!id && id.indexOf('请') !== 0
  })
}

function isSubscribeConfigured() {
  return getTemplateIds().length > 0
}

function getLocalPushStatus() {
  let s = null
  try {
    s = wx.getStorageSync(PUSH_STATUS_KEY)
  } catch (e) {
    s = null
  }
  return Object.assign({ enabled: false, lastRequestAt: 0 }, s || {})
}

function setLocalPushStatus(patch) {
  const next = Object.assign({}, getLocalPushStatus(), patch)
  try {
    wx.setStorageSync(PUSH_STATUS_KEY, next)
  } catch (e) {}
  return next
}

// 读取提前提醒天数（延迟引用，避免与 device.js 形成循环依赖）
function currentAdvanceDays() {
  try {
    return require('./device.js').getAdvanceDays()
  } catch (e) {
    return 30
  }
}

// 请求订阅授权（必须在用户点击事件中调用）
function requestSubscribe() {
  return new Promise(function (resolve, reject) {
    const tmplIds = getTemplateIds()
    if (!tmplIds.length) {
      resolve({ skipped: true, accepted: 0 })
      return
    }
    if (!wx.requestSubscribeMessage) {
      reject(new Error('当前基础库不支持订阅消息'))
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: tmplIds,
      success: function (res) {
        const accepted = tmplIds.filter(function (id) {
          return res[id] === 'accept'
        })
        setLocalPushStatus({
          enabled: accepted.length > 0,
          lastRequestAt: Date.now()
        })

        if (accepted.length && available) {
          addSubscribeCredits(accepted.length, currentAdvanceDays())
            .then(function () {
              resolve({ skipped: false, accepted: accepted.length })
            })
            .catch(function () {
              resolve({ skipped: false, accepted: accepted.length })
            })
        } else {
          resolve({ skipped: false, accepted: accepted.length })
        }
      },
      fail: function (err) {
        setLocalPushStatus({ enabled: false })
        reject(err)
      }
    })
  })
}

module.exports = {
  init: init,
  isAvailable: isAvailable,
  isEnabled: isEnabled,
  login: login,
  getError: getError,
  pullDevices: pullDevices,
  pushDevice: pushDevice,
  pushDevices: pushDevices,
  deleteDevice: deleteDevice,
  getPushConfig: getPushConfig,
  addSubscribeCredits: addSubscribeCredits,
  updatePushConfig: updatePushConfig,
  getTemplateIds: getTemplateIds,
  isSubscribeConfigured: isSubscribeConfigured,
  getLocalPushStatus: getLocalPushStatus,
  requestSubscribe: requestSubscribe
  ,createTeam: createTeam
  ,joinTeam: joinTeam
  ,listTeams: listTeams
  ,listMaintenance: listMaintenance
  ,addMaintenance: addMaintenance
  ,getProfile: getProfile
  ,saveProfile: saveProfile
}
