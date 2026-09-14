// utils/config.js
// 云开发 / 订阅消息相关配置
// 部署前请按下方注释替换成你自己的配置

module.exports = {
  // 云开发环境 ID：微信开发者工具 - 云开发 - 设置 - 环境 ID
  // 留空则使用当前小程序默认的云开发环境
  CLOUD_ENV: 'cloud1-d0gp4f27p361054e5',

  // 订阅消息模板 ID：微信公众平台 - 功能 - 订阅消息 中申请后填写
  // 需与 cloudfunctions/notify/index.js 中的 TEMPLATE_ID 保持一致
  // 数组为空表示未配置，页面会给出提示
  SUBSCRIBE_TEMPLATE_IDS: ['p0XVlOZARY0_Z58SBVQ1VUXVEPmyAW_cm1q86-011qU'],

  // 单次同步最多推送的记录条数（云函数端同样有上限）
  SYNC_PUSH_BATCH: 50
}
