// app.js
const cloud = require('./utils/cloud.js')
const deviceUtil = require('./utils/device.js')

App({
  globalData: {
    // 本次启动是否已弹过到期提醒，避免重复弹窗
    reminderShown: false,
    // 云开发是否可用（用于界面提示）
    cloudReady: false
  },

  onLaunch() {
    // 初始化云开发，并在启动时静默做一次全量同步
    const ready = cloud.init()
    this.globalData.cloudReady = ready
    if (!ready) {
      deviceUtil.syncNow()
      return
    }
    // 微信登录无需用户填写账号；启动时静默获取 OPENID，随后同步设备数据。
    cloud.login().then(function (user) {
      this.globalData.user = user
      this.globalData.cloudReady = true
      return deviceUtil.syncNow()
    }.bind(this)).catch(function () {
      // 登录失败时保留本地模式，进入首页后仍可重试
    })
  }
})
