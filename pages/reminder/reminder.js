// pages/reminder/reminder.js
const deviceUtil = require('../../utils/device.js')
const cloudUtil = require('../../utils/cloud.js')

Page({
  data: {
    advanceOptions: deviceUtil.ADVANCE_OPTIONS,
    advanceLabels: deviceUtil.ADVANCE_OPTIONS.map(function (n) {
      return n + ' 天'
    }),
    advanceIndex: 2,
    overdueList: [],
    soonList: [],
    normalCount: 0,
    total: 0,
    pushConfigured: false,
    pushEnabled: false,
    pushBusy: false,
    pushDesc: ''
  },

  onShow() {
    this.refresh()
    this.refreshPush()
  },

  // 订阅提醒状态
  refreshPush() {
    const configured = cloudUtil.isSubscribeConfigured()
    const status = cloudUtil.getLocalPushStatus()
    const cloudReady = deviceUtil.isCloudAvailable()
    const enabled = !!(configured && status.enabled && cloudReady)
    let desc = ''
    if (!configured) desc = '未配置订阅模板（见 utils/config.js）'
    else if (!cloudReady) desc = '需先开通云开发才能推送'
    else if (enabled) desc = '已开启，到期前通过微信服务通知提醒'
    else desc = '开启后，到期前会收到微信服务通知提醒'
    this.setData({
      pushConfigured: configured,
      pushEnabled: enabled,
      pushDesc: desc
    })
  },

  refresh() {
    const advanceDays = deviceUtil.getAdvanceDays()
    const options = this.data.advanceOptions
    const idx = options.indexOf(advanceDays)

    const all = deviceUtil.getList().map(function (d) {
      return deviceUtil.decorate(d, advanceDays)
    })

    const overdueList = all
      .filter(function (d) {
        return d.status.key === 'expired'
      })
      .sort(function (a, b) {
        return a.status.daysLeft - b.status.daysLeft
      })

    const soonList = all
      .filter(function (d) {
        return d.status.key === 'warning'
      })
      .sort(function (a, b) {
        return a.status.daysLeft - b.status.daysLeft
      })

    const normalCount = all.filter(function (d) {
      return d.status.key === 'normal'
    }).length

    this.setData({
      advanceIndex: idx > -1 ? idx : 2,
      overdueList: overdueList,
      soonList: soonList,
      normalCount: normalCount,
      total: all.length
    })
  },

  onAdvanceChange(e) {
    const i = Number(e.detail.value)
    const advanceDays = this.data.advanceOptions[i]
    deviceUtil.setSettings({ advanceDays: advanceDays })
    this.setData({ advanceIndex: i })
    this.refresh()
    // 同步提醒阈值到云端，供定时任务使用
    if (cloudUtil.isAvailable()) {
      cloudUtil.updatePushConfig({ advanceDays: advanceDays }).catch(function () {})
    }
  },

  subscribe() {
    if (this.data.pushBusy) return
    if (!cloudUtil.isSubscribeConfigured()) {
      wx.showModal({
        title: '未配置订阅模板',
        content:
          '请先在微信公众平台申请「设备到期提醒」订阅消息模板，并把模板 ID 填入 utils/config.js 的 SUBSCRIBE_TEMPLATE_IDS。',
        showCancel: false
      })
      return
    }
    const that = this
    this.setData({ pushBusy: true })
    cloudUtil
      .requestSubscribe()
      .then(function (res) {
        that.setData({ pushBusy: false })
        that.refreshPush()
        if (res && res.skipped) {
          wx.showToast({ title: '请先配置订阅模板', icon: 'none' })
        } else if (res && res.accepted > 0) {
          wx.showToast({ title: '已开启提醒', icon: 'success' })
        } else {
          wx.showToast({ title: '未授权订阅', icon: 'none' })
        }
      })
      .catch(function () {
        that.setData({ pushBusy: false })
        wx.showToast({ title: '订阅失败', icon: 'none' })
      })
  },

  testNotify() {
    if (!cloudUtil.isAvailable()) {
      wx.showToast({ title: '云开发未连接', icon: 'none' })
      return
    }
    wx.showLoading({ title: '发送测试中' })
    wx.cloud.callFunction({ name: 'notify', data: {} }).then(function (res) {
      const result = res && res.result ? res.result : {}
      wx.showModal({ title: '测试结果', content: '已发送：' + (result.sent || 0) + '，跳过：' + (result.skipped || 0) + '，失败：' + (result.failed || 0), showCancel: false })
    }).catch(function (err) {
      wx.showModal({ title: '调用失败', content: (err && (err.errMsg || err.message)) || 'notify 调用失败', showCancel: false })
    }).then(function () { wx.hideLoading() })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' })
  },

  onEmptyAction() {
    if (this.data.total === 0) this.goAdd()
    else this.goHome()
  }
})
