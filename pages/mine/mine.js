const cloud = require('../../utils/cloud.js')
Page({
  data: { name: '未设置姓名', teamName: '尚未加入团队', memberCount: 0 },
  onShow() {
    this.setData({ name: wx.getStorageSync('user_profile_name') || '未设置姓名' })
    if (!cloud.isAvailable()) return
    cloud.getProfile().then(function (res) {
      const name = res && res.profile && res.profile.name
      if (name) { wx.setStorageSync('user_profile_name', name); this.setData({ name: name }) }
    }.bind(this)).catch(function () {})
    cloud.listTeams().then(function (res) {
      const teams = res.teams || []
      this.setData({ teamName: teams.length ? teams[0].name : '尚未加入团队', memberCount: (res.members || []).length })
    }.bind(this)).catch(function () {})
  },
  editProfile() { wx.navigateTo({ url: '/pages/profile/profile' }) },
  manageTeam() { wx.navigateTo({ url: '/pages/team/team' }) }
})
