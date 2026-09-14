// 云函数：notify
// 由定时触发器调用：查询即将到期的设备并下发订阅消息
// 模板 ID 与字段映射只保存在服务端，避免写入小程序端
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 订阅消息模板 ID：与 utils/config.js 的 SUBSCRIBE_TEMPLATE_IDS 保持一致
const TEMPLATE_ID = 'p0XVlOZARY0_Z58SBVQ1VUXVEPmyAW_cm1q86-011qU'

// 下发环境：developer 开发版 / trial 体验版 / formal 正式版
// 测试阶段使用 developer；正式发布前改为 formal
const MINIPROGRAM_STATE = 'developer'

// 模板字段映射：key 为模板中的数据字段名，请按你申请的模板实际字段调整
// 常见模板字段：thing1（设备名称）、time2（到期时间）、thing3（备注）
const FIELD_MAP = {
  name: 'thing1',
  date: 'time3',
  remark: 'number2'
}

const PAGE_SIZE = 100

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function toDateStr(date) {
  return (
    date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
  )
}

function parseDate(str) {
  if (!str || typeof str !== 'string') return null
  const parts = str.split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function daysLeftOf(expireDate) {
  const a = parseDate(toDateStr(new Date()))
  const b = parseDate(expireDate)
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function minutesLeftOf(expireDate, expireTime) {
  const p = String(expireTime || '23:59').split(':').map(Number)
  const d = new Date(expireDate + 'T' + String(p[0] || 0).padStart(2, '0') + ':' + String(p[1] || 0).padStart(2, '0') + ':00')
  return Math.ceil((d.getTime() - Date.now()) / 60000)
}

// 分页读取集合（云函数端单次最多 100 条）
async function fetchAll(collection, where) {
  const all = []
  let skip = 0
  while (true) {
    let query = db.collection(collection)
    if (where) query = query.where(where)
    const res = await query.skip(skip).limit(PAGE_SIZE).get()
    const data = res.data || []
    for (let i = 0; i < data.length; i++) all.push(data[i])
    if (data.length < PAGE_SIZE) break
    skip += PAGE_SIZE
  }
  return all
}

exports.main = async function () {
  if (!TEMPLATE_ID || TEMPLATE_ID.indexOf('请') === 0) {
    return { ok: false, reason: 'template-id-not-configured' }
  }

  // 集合尚未创建时直接返回，避免定时任务报错
  let configs = []
  try {
    configs = await fetchAll('device_push', { enabled: true })
  } catch (e) {
    return { ok: false, reason: 'collection-not-ready' }
  }

  const result = { ok: true, users: configs.length, sent: 0, skipped: 0, failed: 0 }

  for (let i = 0; i < configs.length; i++) {
    const cfg = configs[i]
    try {
      // 一次性订阅：没有可下发次数则跳过
      if (!(cfg.credits > 0)) {
        result.skipped += 1
        continue
      }

      const openid = cfg._openid
      const advance = cfg.advanceDays || 30

      const devices = (await fetchAll('devices', { _openid: openid })).filter(
        function (d) {
          return !d.deleted && d.expireDate
        }
      )

      const pending = devices
        .map(function (d) {
          return Object.assign({}, d, { daysLeft: daysLeftOf(d.expireDate), minutesLeft: minutesLeftOf(d.expireDate, d.expireTime) })
        })
        .filter(function (d) {
          return d.minutesLeft !== null && d.minutesLeft <= advance * 1440
        })
        .sort(function (a, b) {
          return a.daysLeft - b.daysLeft
        })

      if (!pending.length) {
        result.skipped += 1
        continue
      }

      const top = pending[0]
      const statusText =
        top.minutesLeft < 0
          ? '已超期' + Math.abs(top.minutesLeft) + '分钟'
          : top.minutesLeft < 1440
          ? '剩余' + top.minutesLeft + '分钟'
          : top.daysLeft === 0
          ? '今天到期'
          : '剩余' + top.daysLeft + '天'

      const data = {}
      data[FIELD_MAP.name] = { value: String(top.name || '设备').slice(0, 20) }
      data[FIELD_MAP.date] = { value: String(top.expireDate || toDateStr(new Date())) + ' ' + String(top.expireTime || '23:59') }
      data[FIELD_MAP.remark] = { value: String(Math.abs(top.daysLeft || 0)) }

      await cloud.openapi.subscribeMessage.send({
        touser: openid,
        templateId: TEMPLATE_ID,
        page: 'pages/reminder/reminder',
        lang: 'zh_CN',
        miniprogramState: MINIPROGRAM_STATE,
        data: data
      })

      // 下发成功后消耗一次额度
      await db
        .collection('device_push')
        .doc(cfg._id)
        .update({ data: { credits: _.inc(-1), lastPushAt: Date.now() } })

      result.sent += 1
    } catch (e) {
      result.failed += 1
      console.error('send subscribe message failed:', cfg && cfg._openid, e)
    }
  }

  return result
}
