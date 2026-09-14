// pages/detail/detail.js
const deviceUtil = require('../../utils/device.js')
const cloudUtil = require('../../utils/cloud.js')

Page({
  data: {
    id: '',
    device: null,
    daysNumber: '',
    daysUnit: '',
    maintenanceList: []
  },

  onLoad(options) {
    this.setData({ id: (options && options.id) || '' })
  },

  onShow() {
    this.load()
  },

  load() {
    const id = this.data.id
    const raw = deviceUtil.getById(id)
    if (!raw) {
      wx.showToast({ title: '设备不存在', icon: 'none' })
      setTimeout(function () {
        wx.navigateBack()
      }, 800)
      return
    }

    const device = deviceUtil.decorate(raw, deviceUtil.getAdvanceDays())
    let daysNumber = ''
    let daysUnit = ''
    const d = device.status.daysLeft
    if (d === null) {
      daysNumber = '--'
      daysUnit = '未设置到期时间'
    } else if (d < 0) {
      daysNumber = String(Math.abs(d))
      daysUnit = '已超期（天）'
    } else if (d === 0) {
      daysNumber = '0'
      daysUnit = '今天到期'
    } else {
      daysNumber = String(d)
      daysUnit = '剩余天数'
    }

    this.setData({
      device: device,
      daysNumber: daysNumber,
      daysUnit: daysUnit
    })
    if (cloudUtil.isAvailable()) cloudUtil.listMaintenance(id).then(function (res) {
      const list = (res.list || []).map(function (item) { return Object.assign({}, item, { recordAtText: deviceUtil.formatDateTime(item.recordAt), operatorText: item.operatorName || item.operatorOpenid || '当前用户' }) })
      this.setData({ maintenanceList: list })
    }.bind(this)).catch(function () {})
  },

  onEdit() {
    wx.navigateTo({ url: '/pages/add/add?id=' + this.data.id })
  },

  onMaintenance() { wx.navigateTo({ url: '/pages/maintenance/maintenance?deviceId=' + this.data.id }) },

  onDelete() {
    const that = this
    wx.showModal({
      title: '删除设备',
      content: '删除后无法恢复，确定删除该设备吗？',
      confirmText: '删除',
      confirmColor: '#e5484d',
      success(res) {
        if (!res.confirm) return
        // 软删除本地记录后会自动后台同步到云端
        deviceUtil.remove(that.data.id)
        wx.showToast({ title: '已删除', icon: 'success' })
        setTimeout(function () {
          wx.navigateBack()
        }, 600)
      }
    })
  }
})
