# 设备管理微信小程序

面向企业和团队的设备台账管理小程序，支持设备生命周期管理、云端同步、到期提醒、维护记录和团队协作。

## 功能

- 设备新增、编辑、删除和详情查看
- 按名称、编号、位置、型号和类型搜索
- 正常、即将到期、已过期状态统计与筛选
- 到期时间精确到分钟，支持提前 7、15、30、60、90 天提醒
- 微信订阅消息和云函数定时检查
- 本地缓存、离线录入及云端双向同步
- 首次使用设置个人资料，设备记录录入人
- 检查、保养、维修、更换等维护记录
- 创建团队、邀请码加入、成员姓名和角色展示
- 团队负责人查看团队成员录入的设备

## 技术结构

项目使用微信小程序原生框架、Skyline 渲染器、GlassEasel 组件框架和微信云开发。

```text
pages/
  index/          设备列表
  reminder/       到期提醒与订阅
  mine/           个人中心
  profile/        个人资料
  team/           团队管理
  add/            新增/编辑设备
  detail/         设备详情与维护记录
  maintenance/    新增维护记录

cloudfunctions/
  login/          微信身份识别
  device/         设备、资料、维护记录和订阅配置
  team/           团队及成员管理
  notify/         定时发送订阅消息

utils/
  config.js       云环境和订阅模板配置
  cloud.js        云函数调用封装
  device.js       设备状态、本地存储和同步
```

## 开始开发

1. 安装并登录微信开发者工具。
2. 导入本项目目录，AppID 使用项目所属小程序的 AppID。
3. 打开“云开发”，确认环境为 `cloud1-d0gp4f27p361054e5`。
4. 点击“编译”启动模拟器。
5. 登录、订阅消息和通知发送请使用真机调试。

项目的云环境配置位于：

```js
// utils/config.js
module.exports = {
  CLOUD_ENV: 'cloud1-d0gp4f27p361054e5',
  SUBSCRIBE_TEMPLATE_IDS: [
    'p0XVlOZARY0_Z58SBVQ1VUXVEPmyAW_cm1q86-011qU'
  ]
}
```

## 部署云函数

在微信开发者工具中依次右键以下目录，选择“上传并部署：云端安装依赖”：

1. `cloudfunctions/login`
2. `cloudfunctions/device`
3. `cloudfunctions/team`
4. `cloudfunctions/notify`

云函数首次调用会创建使用到的集合：

- `devices`
- `device_push`
- `maintenance_records`
- `user_profiles`
- `teams`
- `team_members`

修改任何云函数后必须重新部署对应函数，仅重新编译小程序不会更新云端代码。

## 订阅消息

当前模板字段映射位于 `cloudfunctions/notify/index.js`：

| 模板字段 | 内容 |
|---|---|
| `thing1` | 设备名称 |
| `time3` | 到期日期和时间 |
| `number2` | 剩余或超期天数 |

用户需要在“提醒”页主动授权。一次性订阅同意一次只能发送一次，发送成功后会消耗一份额度。

`cloudfunctions/notify/config.json` 默认每 5 分钟触发一次：

```json
{
  "config": "0 */5 * * * * *"
}
```

开发版测试使用 `MINIPROGRAM_STATE = 'developer'`；正式发布前改成 `formal` 并重新部署 `notify`。

## 数据权限

- 普通用户只能看到自己录入的设备。
- 团队负责人可以看到本团队所有成员录入的设备。
- 设备保留录入人的 OpenID 和姓名。
- 维护记录保留维护人的 OpenID、姓名和维护时间。
- 姓名由 `user_profiles` 集合按 OpenID 关联。
- 成员设备的所有权属于原录入人，负责人查看时不会改变所有权。

## 测试提醒

1. 真机打开小程序。
2. 在个人中心设置姓名。
3. 新增一台即将到期的设备。
4. 在提醒页点击“微信订阅到期提醒”并允许。
5. 点击“立即测试提醒”。
6. 查看返回的 `sent`、`skipped` 和 `failed`。

```json
{
  "ok": true,
  "users": 1,
  "sent": 1,
  "skipped": 0,
  "failed": 0
}
```

- `sent > 0`：发送成功
- `skipped > 0`：没有订阅额度或没有符合条件的设备
- `failed > 0`：查看 `notify` 云函数日志

## 文档

- [云开发配置](./CLOUD_SETUP.md)
- [开发与运营手册](./DEVELOPMENT_GUIDE.md)

## 发布检查

- 小程序 AppID 和云环境正确
- 四个云函数均已部署最新版本
- 订阅模板 ID 和字段映射一致
- 定时触发器已创建并正常运行
- 正式版的 `MINIPROGRAM_STATE` 已设为 `formal`
- 真机完成资料、团队、设备同步、维护记录和订阅消息测试
- 在微信公众平台提交审核并发布
