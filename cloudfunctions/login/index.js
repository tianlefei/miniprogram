// 云函数：login
// 返回当前调用用户的 openid，用于云端数据归属与跨设备同步
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const ctx = cloud.getWXContext()
  return {
    openid: ctx.OPENID,
    appid: ctx.APPID,
    unionid: ctx.UNIONID
  }
}
