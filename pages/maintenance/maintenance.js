const cloud = require('../../utils/cloud.js')
Page({
  data: { deviceId: '', typeIndex: 0, types: ['检查', '保养', '维修', '更换'], content: '' },
  onLoad(o) { this.setData({ deviceId: o && o.deviceId || '' }) },
  onTypeChange(e) { this.setData({ typeIndex: Number(e.detail.value) }) },
  onInput(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }) },
  submit() {
    if (!this.data.content.trim()) return wx.showToast({ title: '请填写处理内容', icon: 'none' })
    const name = String(wx.getStorageSync('user_profile_name') || '').trim()
    if (!name) return wx.showToast({ title: '请先设置个人资料', icon: 'none' })
    wx.setStorageSync('user_profile_name', name)
    cloud.addMaintenance(this.data.deviceId, { type: this.data.types[this.data.typeIndex], content: this.data.content.trim(), operatorName: name, recordAt: Date.now() }).then(function (res) { if (res && res.ok === false) return wx.showToast({ title: '请先设置个人姓名', icon: 'none' }); wx.showToast({ title: '已保存', icon: 'success' }); setTimeout(function () { wx.navigateBack() }, 500) }).catch(function () { wx.showToast({ title: '保存失败', icon: 'none' }) })
  }
})
