// utils/device.js
// 设备数据存储、到期状态计算与提醒相关的通用逻辑

const cloud = require('./cloud.js')

const STORAGE_KEY = 'device_list_v1'
const SETTINGS_KEY = 'device_settings_v1'
const SYNC_META_KEY = 'device_sync_meta_v1'
const DEFAULT_ADVANCE_DAYS = 30

// 设备类型可选项
const CATEGORIES = [
  '消防设备',
  '安防监控',
  '仪器仪表',
  '医疗器械',
  '电梯设备',
  '电气设备',
  '办公设备',
  '其他'
]

// 提醒阈值可选天数
const ADVANCE_OPTIONS = [7, 15, 30, 60, 90]

// 各状态对应的展示样式
const STATUS_MAP = {
  expired: {
    key: 'expired',
    label: '已过期',
    color: '#e5484d',
    bg: '#feeceb',
    gradient: 'linear-gradient(135deg, #ff7a7a 0%, #e5484d 100%)',
    rank: 0
  },
  warning: {
    key: 'warning',
    label: '即将到期',
    color: '#e08c00',
    bg: '#fff4e0',
    gradient: 'linear-gradient(135deg, #ffc061 0%, #e08c00 100%)',
    rank: 1
  },
  normal: {
    key: 'normal',
    label: '正常',
    color: '#12a150',
    bg: '#e6f7ee',
    gradient: 'linear-gradient(135deg, #4ddb9b 0%, #12a150 100%)',
    rank: 2
  },
  none: {
    key: 'none',
    label: '未设置',
    color: '#8a94a6',
    bg: '#eef1f6',
    gradient: 'linear-gradient(135deg, #b8c1d1 0%, #8a94a6 100%)',
    rank: 3
  }
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function toDateStr(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
}

// 今天的日期字符串 YYYY-MM-DD
function todayStr() {
  return toDateStr(new Date())
}

// 时间戳格式化为 YYYY-MM-DD HH:mm
function formatDateTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    ' ' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  )
}

function parseDate(str) {
  if (!str || typeof str !== 'string') return null
  const parts = str.split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function parseDateTime(dateStr, timeStr) {
  const d = parseDate(dateStr)
  if (!d) return null
  const p = String(timeStr || '23:59').split(':').map(Number)
  d.setHours(p[0] || 0, p[1] || 0, 0, 0)
  return d
}

// 在日期上增加月份，自动处理月末溢出（如 1-31 加一个月）
function addMonths(dateStr, months) {
  const base = parseDate(dateStr)
  if (!base) return ''
  const target = new Date(base.getFullYear(), base.getMonth() + Number(months), 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(base.getDate(), lastDay))
  return toDateStr(target)
}

// 返回 toStr - fromStr 的天数差
function daysBetween(fromStr, toStr) {
  const a = parseDate(fromStr)
  const b = parseDate(toStr)
  if (!a || !b) return 0
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/* ---------------- 设置 ---------------- */

function getSettings() {
  let s = null
  try {
    s = wx.getStorageSync(SETTINGS_KEY)
  } catch (e) {
    s = null
  }
  const merged = Object.assign({ advanceDays: DEFAULT_ADVANCE_DAYS }, s || {})
  if (ADVANCE_OPTIONS.indexOf(merged.advanceDays) === -1) {
    merged.advanceDays = DEFAULT_ADVANCE_DAYS
  }
  return merged
}

function setSettings(settings) {
  wx.setStorageSync(SETTINGS_KEY, Object.assign({}, getSettings(), settings || {}))
}

function getAdvanceDays() {
  return getSettings().advanceDays
}

/* ---------------- 状态计算 ---------------- */

function getStatus(device, advanceDays) {
  const advance =
    typeof advanceDays === 'number' ? advanceDays : getAdvanceDays()
  if (!device || !device.expireDate) {
    return Object.assign({ daysLeft: null }, STATUS_MAP.none)
  }
  const expiry = parseDateTime(device.expireDate, device.expireTime)
  const minutesLeft = expiry ? Math.ceil((expiry.getTime() - Date.now()) / 60000) : null
  const daysLeft = minutesLeft === null ? 0 : Math.ceil(minutesLeft / 1440)
  let key = 'normal'
  if (minutesLeft < 0) key = 'expired'
  else if (minutesLeft <= advance * 1440) key = 'warning'
  return Object.assign({ daysLeft: daysLeft, minutesLeft: minutesLeft }, STATUS_MAP[key])
}

// 给设备补充状态、倒计时文案、使用进度等展示字段
function decorate(device, advanceDays) {
  const status = getStatus(device, advanceDays)
  const item = Object.assign({}, device, { status: status })

  let percent = 0
  if (device.installDate && device.expireDate) {
    const total = daysBetween(device.installDate, device.expireDate)
    const used = daysBetween(device.installDate, todayStr())
    if (total > 0) percent = Math.round((used / total) * 100)
  }
  item.percent = Math.min(100, Math.max(0, percent))

  const d = status.daysLeft
  if (d === null) item.daysText = '未设置到期时间'
  else if (d < 0) item.daysText = '已超期 ' + Math.abs(d) + ' 天'
  else if (d === 0) item.daysText = '今天到期'
  else item.daysText = '剩余 ' + d + ' 天'

  item.lifespanText = device.lifespan ? device.lifespan + ' 个月' : '未设置'
  item.updatedAtText = formatDateTime(device.updatedAt || device.createdAt)
  return item
}

/* ---------------- 存储读写 ---------------- */

// 读取全部原始记录（含已删除的墓碑记录），供同步使用
function getAllRaw() {
  let list = null
  try {
    list = wx.getStorageSync(STORAGE_KEY)
  } catch (e) {
    list = null
  }
  return Array.isArray(list) ? list : []
}

function saveAllRaw(list) {
  wx.setStorageSync(STORAGE_KEY, list || [])
}

// 对外读取：过滤掉已删除记录
function getList() {
  return getAllRaw().filter(function (d) {
    return !d.deleted
  })
}

function saveList(list) {
  saveAllRaw(list || [])
}

function genId() {
  return 'd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function getById(id) {
  const list = getList()
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i]
  }
  return null
}

// 新增或更新设备（本地优先，随后后台同步到云端）
function upsert(device) {
  const list = getAllRaw()
  const now = Date.now()
  let saved = null
  if (device.id) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === device.id) {
        list[i] = Object.assign({}, list[i], device, {
          updatedAt: now,
          deleted: false,
          dirty: true
        })
        saved = list[i]
        break
      }
    }
  }
  if (!saved) {
    saved = Object.assign({}, device, {
      id: genId(),
      createdAt: now,
      updatedAt: now,
      deleted: false,
      dirty: true
    })
    list.unshift(saved)
  }
  saveAllRaw(list)
  queuePush()
  return saved
}

// 软删除：保留墓碑记录，便于把删除动作同步到其他设备
function remove(id) {
  const list = getAllRaw()
  const now = Date.now()
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) {
      list[i] = Object.assign({}, list[i], {
        deleted: true,
        updatedAt: now,
        dirty: true
      })
      break
    }
  }
  saveAllRaw(list)
  queuePush()
}

// 导入一组示例数据，方便快速体验到期提醒效果
function seedDemo() {
  const specs = [
    {
      name: '消防主机',
      category: '消防设备',
      model: 'JB-QB-GST5000',
      sn: 'XF-2021-0087',
      location: '1 号楼负一层消防控制室',
      installOffset: -35,
      lifespan: 36,
      remark: '每年需做一次联动测试'
    },
    {
      name: '高清监控摄像头',
      category: '安防监控',
      model: 'DS-2CD3T46',
      sn: 'CAM-A-0212',
      location: '园区东门',
      installOffset: -34,
      lifespan: 36,
      remark: ''
    },
    {
      name: '压力变送器',
      category: '仪器仪表',
      model: 'EJA430E',
      sn: 'YQ-0091',
      location: '锅炉房 2 号管线',
      installOffset: -23,
      lifespan: 24,
      remark: '需定期校准'
    },
    {
      name: '电梯曳引机',
      category: '电梯设备',
      model: 'TWS-1000',
      sn: 'DT-3-0001',
      location: '3 号楼 1 号梯',
      installOffset: -11,
      lifespan: 12,
      remark: '更换时需提前停梯报备'
    },
    {
      name: '医用氧气瓶',
      category: '医疗器械',
      model: '40L',
      sn: 'YY-0233',
      location: '住院部 3 楼',
      installOffset: -2,
      lifespan: 12,
      remark: ''
    }
  ]

  const list = specs.map(function (s) {
    const installDate = addMonths(todayStr(), s.installOffset)
    const now = Date.now()
    return {
      id: genId(),
      name: s.name,
      category: s.category,
      model: s.model,
      sn: s.sn,
      location: s.location,
      installDate: installDate,
      lifespan: s.lifespan,
      expireDate: addMonths(installDate, s.lifespan),
      remark: s.remark,
      createdAt: now,
      updatedAt: now,
      deleted: false,
      dirty: true
    }
  })
  saveAllRaw(list)
  queuePush()
  return list
}

/* ---------------- 云端同步 ---------------- */

let syncMeta = null
const listeners = []

function getSyncMeta() {
  if (!syncMeta) {
    let s = null
    try {
      s = wx.getStorageSync(SYNC_META_KEY)
    } catch (e) {
      s = null
    }
    syncMeta = Object.assign(
      { status: 'idle', lastSyncAt: 0, lastError: '' },
      s || {}
    )
  }
  return syncMeta
}

function setSyncMeta(patch) {
  syncMeta = Object.assign({}, getSyncMeta(), patch || {})
  try {
    wx.setStorageSync(SYNC_META_KEY, syncMeta)
  } catch (e) {}
  return syncMeta
}

// 供页面订阅数据变化（云端同步完成后刷新列表）
function onChange(cb) {
  listeners.push(cb)
  return function off() {
    const i = listeners.indexOf(cb)
    if (i > -1) listeners.splice(i, 1)
  }
}

function emitChange() {
  listeners.slice().forEach(function (cb) {
    try {
      cb()
    } catch (e) {}
  })
}

function isCloudAvailable() {
  return cloud.isAvailable()
}

// 合并本地与云端记录：同一 id 以 updatedAt 较新者为准
function mergeRemote(remoteList) {
  const map = {}
  getAllRaw().forEach(function (d) {
    map[d.id] = d
  })
  ;(remoteList || []).forEach(function (r) {
    if (!r || !r.id) return
    const local = map[r.id]
    if (!local || (r.updatedAt || 0) > (local.updatedAt || 0)) {
      map[r.id] = Object.assign({}, r, { dirty: false })
    } else {
      // 姓名和所有者由云端关联生成，不参与业务更新时间比较，始终回填本地缓存。
      map[r.id] = Object.assign({}, local, {
        creatorOpenid: r.creatorOpenid || local.creatorOpenid || '',
        creatorName: r.creatorName || local.creatorName || '',
        ownerOpenid: r.ownerOpenid || local.ownerOpenid || ''
      })
    }
  })
  return Object.keys(map).map(function (k) {
    return map[k]
  })
}

// 未同步到云端的记录条数
function getPendingCount() {
  return getAllRaw().filter(function (d) {
    return d.dirty
  }).length
}

// 把本地待同步记录推送到云端
function pushPending() {
  if (!cloud.isAvailable()) {
    return Promise.resolve({ ok: false, reason: 'cloud-unavailable' })
  }
  const all = getAllRaw()
  const pending = all.filter(function (d) {
    return d.dirty
  })
  if (!pending.length) {
    return Promise.resolve({ ok: true, pushed: 0 })
  }
  setSyncMeta({ status: 'syncing' })
  return cloud
    .pushDevices(pending)
    .then(function () {
      pending.forEach(function (d) {
        d.dirty = false
      })
      saveAllRaw(all)
      setSyncMeta({ status: 'synced', lastSyncAt: Date.now(), lastError: '' })
      emitChange()
      return { ok: true, pushed: pending.length }
    })
    .catch(function (e) {
      setSyncMeta({
        status: 'error',
        lastError: (e && (e.errMsg || e.message)) || '同步失败'
      })
      return { ok: false, error: e }
    })
}

// 本地变更后触发的轻量推送（不阻塞页面）
function queuePush() {
  if (!cloud.isAvailable()) return
  setTimeout(function () {
    pushPending()
  }, 0)
}

// 全量同步：拉取云端 -> 合并本地 -> 推送本地新增/修改
function syncNow() {
  if (!cloud.isAvailable()) {
    setSyncMeta({ status: 'local', lastError: '' })
    return Promise.resolve({ ok: false, reason: 'cloud-unavailable' })
  }
  setSyncMeta({ status: 'syncing', lastError: '' })
  return cloud
    .pullDevices()
    .then(function (remote) {
      const merged = mergeRemote(remote)
      saveAllRaw(merged)
      const pending = merged.filter(function (d) {
        return d.dirty
      })
      if (!pending.length) return { pushed: 0 }
      return cloud.pushDevices(pending).then(function () {
        pending.forEach(function (d) {
          d.dirty = false
        })
        saveAllRaw(merged)
        return { pushed: pending.length }
      })
    })
    .then(function (r) {
      setSyncMeta({ status: 'synced', lastSyncAt: Date.now(), lastError: '' })
      emitChange()
      return { ok: true, pushed: (r && r.pushed) || 0 }
    })
    .catch(function (e) {
      setSyncMeta({
        status: 'error',
        lastError: (e && (e.errMsg || e.message)) || '同步失败'
      })
      return { ok: false, error: e }
    })
}

// 相对时间文案
function formatRelative(ts) {
  if (!ts) return '尚未同步'
  const diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'
  return Math.floor(diff / 86400000) + ' 天前'
}

module.exports = {
  CATEGORIES: CATEGORIES,
  ADVANCE_OPTIONS: ADVANCE_OPTIONS,
  STATUS_MAP: STATUS_MAP,
  todayStr: todayStr,
  parseDate: parseDate,
  parseDateTime: parseDateTime,
  addMonths: addMonths,
  daysBetween: daysBetween,
  formatDateTime: formatDateTime,
  getSettings: getSettings,
  setSettings: setSettings,
  getAdvanceDays: getAdvanceDays,
  getStatus: getStatus,
  decorate: decorate,
  getList: getList,
  getAllRaw: getAllRaw,
  saveList: saveList,
  saveAllRaw: saveAllRaw,
  getById: getById,
  upsert: upsert,
  remove: remove,
  seedDemo: seedDemo,
  getSyncMeta: getSyncMeta,
  setSyncMeta: setSyncMeta,
  isCloudAvailable: isCloudAvailable,
  onChange: onChange,
  getPendingCount: getPendingCount,
  syncNow: syncNow,
  pushPending: pushPending,
  formatRelative: formatRelative
}
