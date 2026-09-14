Page({
  data: { name: '', first: false },
  onLoad(o) {
    this.setData({ name: wx.getStorageSync('user_profile_name') || '', first: !!(o && o.first) })
    const cloud = require('../../utils/cloud.js')
    if (cloud.isAvailable()) cloud.getProfile().then(function (res) { if (res && res.profile && res.profile.name) { wx.setStorageSync('user_profile_name', res.profile.name); this.setData({ name: res.profile.name }) } }.bind(this)).catch(function () {})
  },
  onInput(e) { this.setData({ name: e.detail.value }) },
  save() {
    const name = (this.data.name || '').trim()
    if (!name) return wx.showToast({ title: '请填写姓名', icon: 'none' })
    wx.setStorageSync('user_profile_name', name)
    const done = function () { wx.showToast({ title: '已保存', icon: 'success' }); setTimeout(function () { wx.navigateBack() }, 400) }
    const cloud = require('../../utils/cloud.js')
    if (cloud.isAvailable()) cloud.saveProfile(name).then(done).catch(done)
    else done()
  }
})
