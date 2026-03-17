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


## 真正逐帧动画版
- 新增 players_anim.png 与 enemies_anim.png
- 角色与怪物按 4 帧 spritesheet 播放
- 待机与移动使用不同播放速度
- 贴图加载失败时自动回退到原绘制方案
