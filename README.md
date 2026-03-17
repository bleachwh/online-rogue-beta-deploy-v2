# Online Rogue Beta Deploy Fixed

这是修复版，重点解决：
- 朋友加入房间没有明显反馈
- 房间码大小写/空格导致加入失败
- 前端看起来“没跳页”但实际是 join 没成功
- 缺少连接状态提示

## 本地运行

```bash
npm install
npm start
```

## Railway / Render

直接替换原项目代码后重新部署即可。


## 本次更新
- 房间等待时可自由移动
- 单人也能准备后开始游戏
- 怪物改为原创像素贴图风，不使用第三方游戏官方素材
- 升级出现时角色仍可继续移动


## 贴图资源
- 新增原创像素角色 spritesheet：`public/assets/players.png`
- 新增原创像素怪物 spritesheet：`public/assets/enemies.png`
- 新增简易地表 tiles：`public/assets/tiles.png`
- 已在客户端中直接套用
