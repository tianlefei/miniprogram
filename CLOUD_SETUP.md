# 云端同步与订阅提醒配置

## 一、开通云开发

1. 在微信开发者工具中开通云开发并创建环境。
2. 若使用非默认环境，把环境 ID 填入 `utils/config.js` 的 `CLOUD_ENV`（留空则使用默认环境）。

## 二、申请订阅消息模板

1. 在微信公众平台「订阅消息」中申请「设备到期提醒」相关模板。
2. 把模板 ID 同时填入：
   - `utils/config.js` 的 `SUBSCRIBE_TEMPLATE_IDS`（小程序端，用于发起授权）
   - `cloudfunctions/notify/index.js` 的 `TEMPLATE_ID`（服务端，用于下发）
3. 按实际申请的模板字段调整 `cloudfunctions/notify/index.js` 中的 `FIELD_MAP`（默认 `thing1` / `time2` / `thing3`）。

## 三、部署云函数

在开发者工具中右键对应云函数目录，选择「上传并部署：云端安装依赖」：

- `cloudfunctions/login`：返回用户 openid
- `cloudfunctions/device`：设备数据与订阅配置服务端读写
- `cloudfunctions/notify`：定时下发订阅消息

`device` 云函数首次调用会自动创建 `devices`、`device_push` 两个集合，无需手动建表。

## 四、订阅提醒的触发

- `cloudfunctions/notify/config.json` 已内置每日 09:00（UTC+8）的定时触发器。
- 用户需在「提醒」页点击「微信订阅到期提醒」完成授权（一次性订阅：同意一次可下发一次）。
- 未填写模板 ID 时，`notify` 会直接返回 `template-id-not-configured`，不会报错中断。

## 五、数据同步说明

- 设备数据以本地缓存为第一读写源，未同步记录会带 `dirty` 标记并后台推送云端。
- 启动时、手动同步时按 `updatedAt` 做双向合并，同一设备以较新的记录为准。
- 删除采用软删除（墓碑记录），确保删除动作也能同步到其他设备。
- 数据按 openid 隔离，同一微信账号在不同设备登录即可看到同一份数据。
- 未开通云开发或未部署云函数时，项目继续使用本地缓存，离线体验不受影响。
