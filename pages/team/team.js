const cloud = require('../../utils/cloud.js')

Page({
  data: { teams: [], members: [], name: '', inviteCode: '', joinCode: '', loading: false },

  onShow() { this.load() },

  load() {
    if (!cloud.isAvailable()) return
    cloud.listTeams().then(function (res) {
      this.setData({ teams: res.teams || [], members: res.members || [] })
    }.bind(this)).catch(function () {})
  },

  onNameInput(e) { this.setData({ name: e.detail.value }) },
  onCodeInput(e) { this.setData({ joinCode: e.detail.value }) },

  create() {
    cloud.createTeam(this.data.name || '我的团队').then(function (res) {
      if (!res || res.ok === false) return wx.showToast({ title: '已有团队，不能创建', icon: 'none' })
      this.setData({ inviteCode: res.inviteCode, name: '' })
      this.load()
      wx.showToast({ title: '创建成功', icon: 'success' })
    }.bind(this)).catch(function () { wx.showToast({ title: '创建失败', icon: 'none' }) })
  },

  join() {
    const code = (this.data.joinCode || '').trim()
    if (!code) return wx.showToast({ title: '请输入邀请码', icon: 'none' })
    cloud.joinTeam(code).then(function (res) {
      if (!res || res.ok === false) return wx.showToast({ title: '邀请码无效', icon: 'none' })
      this.setData({ joinCode: '' }); this.load(); wx.showToast({ title: '加入成功', icon: 'success' })
    }.bind(this)).catch(function () { wx.showToast({ title: '加入失败', icon: 'none' }) })
  },

  copyInvite() {
    if (!this.data.teams.length || !this.data.teams[0].inviteCode) return
    wx.setClipboardData({ data: this.data.teams[0].inviteCode })
  },

  editProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' })
  }
})
