// pages/add/add.js
const deviceUtil = require('../../utils/device.js')

Page({
  data: {
    id: '',
    isEdit: false,
    categories: deviceUtil.CATEGORIES,
    today: '',
    form: {
      name: '',
      category: '',
      categoryIndex: -1,
      model: '',
      sn: '',
      location: '',
      installDate: '',
      lifespan: '12',
      expireDate: '',
      expireTime: '23:59',
      remark: ''
    }
  },

  onLoad(options) {
    const today = deviceUtil.todayStr()
    const data = { today: today }

    if (options && options.id) {
      const device = deviceUtil.getById(options.id)
      if (device) {
        const categoryIndex = deviceUtil.CATEGORIES.indexOf(device.category)
        data.id = device.id
        data.isEdit = true
        data.form = {
          name: device.name || '',
          category: device.category || '',
          categoryIndex: categoryIndex,
          model: device.model || '',
          sn: device.sn || '',
          location: device.location || '',
          installDate: device.installDate || '',
          lifespan: device.lifespan ? String(device.lifespan) : '12',
          expireDate: device.expireDate || '',
          expireTime: device.expireTime || '23:59',
          remark: device.remark || ''
        }
        wx.setNavigationBarTitle({ title: '编辑设备' })
      }
    }

    this.setData(data)
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key
    const value = e.detail.value
    this.setData({ ['form.' + key]: value })
  },

  onCategoryChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      'form.categoryIndex': index,
      'form.category': this.data.categories[index]
    })
  },

  onInstallDateChange(e) {
    this.setData({ 'form.installDate': e.detail.value })
    this.recalcExpire()
  },

  onLifespanInput(e) {
    this.setData({ 'form.lifespan': e.detail.value })
    this.recalcExpire()
  },

  // 使用期限快捷选择
  onLifespanPreset(e) {
    const months = e.currentTarget.dataset.months
    this.setData({ 'form.lifespan': String(months) })
    this.recalcExpire()
  },

  onExpireDateChange(e) {
    this.setData({ 'form.expireDate': e.detail.value })
  },

  onExpireTimeChange(e) {
    this.setData({ 'form.expireTime': e.detail.value })
  },

  // 到期日期 = 安装日期 + 使用期限（月）
  recalcExpire() {
    const form = this.data.form
    const months = parseInt(form.lifespan, 10)
    if (form.installDate && months > 0) {
      this.setData({
        'form.expireDate': deviceUtil.addMonths(form.installDate, months)
      })
    }
  },

  toast(title) {
    wx.showToast({ title: title, icon: 'none' })
  },

  onSubmit() {
    const form = this.data.form
    const name = (form.name || '').trim()

    if (!name) return this.toast('请填写设备名称')
    if (!form.category) return this.toast('请选择设备类型')
    if (!form.installDate) return this.toast('请选择安装日期')

    const months = parseInt(form.lifespan, 10)
    if (!(months > 0)) return this.toast('请填写使用期限(月)')

    const expireDate =
      form.expireDate || deviceUtil.addMonths(form.installDate, months)

    const device = {
      id: this.data.id || '',
      name: name,
      category: form.category,
      model: (form.model || '').trim(),
      sn: (form.sn || '').trim(),
      location: (form.location || '').trim(),
      installDate: form.installDate,
      lifespan: months,
      expireDate: expireDate,
      expireTime: form.expireTime || '23:59',
      remark: (form.remark || '').trim()
    }

    // 本地保存后会自动后台同步到云端
    deviceUtil.upsert(device)

    wx.showToast({
      title: this.data.isEdit ? '保存成功' : '添加成功',
      icon: 'success'
    })

    setTimeout(function () {
      wx.navigateBack()
    }, 600)
  }
})
