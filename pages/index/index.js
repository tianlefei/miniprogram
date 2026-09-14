// pages/index/index.js
const deviceUtil = require('../../utils/device.js')
const cloudUtil = require('../../utils/cloud.js')

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'warning', label: '即将到期' },
  { key: 'expired', label: '已过期' },
  { key: 'normal', label: '正常' }
]

Page({
  data: {
    filters: FILTERS,
    activeFilter: 'all',
    keyword: '',
    allList: [],
    list: [],
    stats: { total: 0, warning: 0, expired: 0, normal: 0 },
    advanceDays: 30,
    cloudReady: false,
    syncInfo: { status: 'idle', tone: 'sync-off', text: '正在检查云同步…', syncing: false }
  },

  onLoad() {
    const that = this
    // 云端同步完成后自动刷新列表与同步状态
    this.offChange = deviceUtil.onChange(function () {
      that.refresh()
      that.refreshSync()
    })
  },

  onUnload() {
    if (this.offChange) this.offChange()
  },

  onShow() {
    if (!this.data.profilePrompted && cloudUtil.isAvailable()) {
      this.data.profilePrompted = true
      cloudUtil.getProfile().then(function (res) {
        if (!res || !res.profile || !res.profile.name) wx.navigateTo({ url: '/pages/profile/profile?first=1' })
      }).catch(function () {})
    } else if (!wx.getStorageSync('user_profile_name') && !this.data.profilePrompted) {
      this.setData({ profilePrompted: true })
      wx.navigateTo({ url: '/pages/profile/profile?first=1' })
    }
    this.refresh()
    this.refreshSync()
    this.checkReminder()
    this.refreshUser()
  },

  refreshUser() {
    const app = getApp()
    if (!cloudUtil.isEnabled()) return
    const that = this
    cloudUtil
      .login()
      .then(function (user) {
        app.globalData.user = user
        app.globalData.cloudReady = true
        that.setData({ cloudReady: true })
        // 登录成功后做一次双向同步（内部按 updatedAt 合并，避免覆盖本地改动）
        return deviceUtil.syncNow()
      })
      .then(function () {
        that.refresh()
        that.refreshSync()
      })
      .catch(function (err) {
        console.error('[cloud] 登录 / 同步失败：', err)
        that.setData({ cloudReady: false })
        that.refreshSync()
      })
  },

  login() {
    const app = getApp()
    if (!cloudUtil.isEnabled()) {
      wx.showToast({ title: '请先配置云环境', icon: 'none' })
      return
    }
    const that = this
    cloudUtil
      .login()
      .then(function (user) {
        app.globalData.user = user
        app.globalData.cloudReady = true
        that.setData({ cloudReady: true })
        that.refreshSync()
        wx.showToast({ title: '登录成功', icon: 'success' })
      })
      .catch(function (err) {
        console.error('[cloud] 登录失败：', err)
        wx.showModal({
          title: '登录失败',
          content:
            cloudUtil.getError() ||
            '请检查云开发环境是否已开通、login 云函数是否已部署（需选择「云端安装依赖」）。',
          showCancel: false
        })
      })
  },

  // 云同步状态展示
  refreshSync() {
    const meta = deviceUtil.getSyncMeta()
    const pending = deviceUtil.getPendingCount()
    const cloudReady = deviceUtil.isCloudAvailable()
    let status = meta.status
    if (!cloudReady) status = 'local'
    else if (pending > 0 && status !== 'syncing' && status !== 'error') status = 'pending'

    const map = {
      idle: { tone: 'sync-off', text: '云同步未开启' },
      local: { tone: 'sync-off', text: '本地模式 · 未开启云同步' },
      syncing: { tone: 'sync-ing', text: '正在同步到云端…' },
      pending: { tone: 'sync-ing', text: pending + ' 项改动待同步' },
      synced: { tone: 'sync-on', text: '云端已同步 · ' + deviceUtil.formatRelative(meta.lastSyncAt) },
      error: {
        tone: 'sync-err',
        text: '同步失败：' + (meta.lastError || '点击重试')
      }
    }
    const info = map[status] || map.idle
    this.setData({
      syncInfo: {
        status: status,
        tone: info.tone,
        text: info.text,
        syncing: status === 'syncing'
      }
    })
  },

  // 手动触发云同步
  onSyncTap() {
    if (this.data.syncInfo.syncing) return
    if (!deviceUtil.isCloudAvailable()) {
      wx.showModal({
        title: '云同步未开启',
        content:
          '请先在微信开发者工具中开通云开发，并部署 login、device、notify 三个云函数（详见 CLOUD_SETUP.md）。',
        showCancel: false
      })
      return
    }
    const that = this
    wx.showLoading({ title: '同步中', mask: true })
    deviceUtil.syncNow().then(function (res) {
      wx.hideLoading()
      that.refresh()
      that.refreshSync()
      if (res && res.ok) {
        wx.showToast({ title: '同步完成', icon: 'success' })
      } else {
        wx.showModal({
          title: '同步失败',
          content:
            (res && res.error && (res.error.errMsg || res.error.message)) ||
            deviceUtil.getSyncMeta().lastError ||
            '请检查云开发环境是否已开通、云函数（login / device）是否已部署（需选择「云端安装依赖」）。',
          showCancel: false
        })
      }
    })
  },

  refresh() {
    const advanceDays = deviceUtil.getAdvanceDays()
    const allList = deviceUtil.getList().map(function (d) {
      return deviceUtil.decorate(d, advanceDays)
    })
    const stats = { total: allList.length, warning: 0, expired: 0, normal: 0 }
    allList.forEach(function (d) {
      if (stats[d.status.key] !== undefined) stats[d.status.key] += 1
    })
    this.setData({ allList: allList, stats: stats, advanceDays: advanceDays })
    this.applyFilter()
  },

  applyFilter() {
    const allList = this.data.allList
    const activeFilter = this.data.activeFilter
    const kw = (this.data.keyword || '').trim().toLowerCase()
    const list = allList.filter(function (item) {
      const matchFilter =
        activeFilter === 'all' || item.status.key === activeFilter
      if (!matchFilter) return false
      if (!kw) return true
      const fields = [item.name, item.sn, item.location, item.model, item.category]
      return fields.some(function (v) {
        return v && String(v).toLowerCase().indexOf(kw) > -1
      })
    })
    this.setData({ list: list })
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value })
    this.applyFilter()
  },

  clearKeyword() {
    this.setData({ keyword: '' })
    this.applyFilter()
  },

  onFilterTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.activeFilter) return
    this.setData({ activeFilter: key })
    this.applyFilter()
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id })
  },

  goReminder() {
    wx.switchTab({ url: '/pages/reminder/reminder' })
  },

  importDemo() {
    const that = this
    wx.showModal({
      title: '导入示例数据',
      content: '将添加 5 台用于演示的设备，是否继续？',
      success(res) {
        if (!res.confirm) return
        deviceUtil.seedDemo()
        that.refresh()
        wx.showToast({ title: '已导入', icon: 'success' })
      }
    })
  },

  // 启动后首次发现有到期 / 超期设备时给出弹窗提醒
  checkReminder() {
    const app = getApp()
    if (!app || !app.globalData || app.globalData.reminderShown) return

    const advanceDays = deviceUtil.getAdvanceDays()
    const all = deviceUtil.getList().map(function (d) {
      return deviceUtil.decorate(d, advanceDays)
    })
    if (!all.length) return

    let overdue = 0
    let soon = 0
    all.forEach(function (d) {
      if (d.status.key === 'expired') overdue += 1
      else if (d.status.key === 'warning') soon += 1
    })
    if (overdue === 0 && soon === 0) return

    app.globalData.reminderShown = true

    let content = ''
    if (overdue > 0) content += overdue + ' 台设备已超过更换期限'
    if (soon > 0) {
      content += (content ? '，' : '') + soon + ' 台设备将在 ' + advanceDays + ' 天内到期'
    }
    content += '，请及时安排更换。'

    wx.showModal({
      title: '到期更换提醒',
      content: content,
      confirmText: '去查看',
      cancelText: '稍后',
      confirmColor: '#2b6de5',
      success(res) {
        if (res.confirm) wx.switchTab({ url: '/pages/reminder/reminder' })
      }
    })
  }
})
