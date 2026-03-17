# Online Rogue Beta Deploy

这是一个可直接部署到 **Railway / Render** 的双人联机肉鸽 beta 示例。

## 本地运行

```bash
npm install
npm start
```

打开 `http://localhost:3000`

## Railway 部署

1. 新建 GitHub 仓库并上传本项目
2. 在 Railway 里选择 **Deploy from GitHub repo**
3. 选中这个仓库
4. Railway 会读取 `package.json` 的 `start` 脚本启动服务
5. 部署完成后，把生成的网址发给朋友
6. 进入页面后创建房间，把房间码发给朋友

## Render 部署

1. 新建 GitHub 仓库并上传本项目
2. 在 Render 里选择 **New Web Service**
3. 连接 GitHub 仓库
4. Build Command 填：`npm install`
5. Start Command 填：`npm start`
6. 部署完成后，把公网网址发给朋友

项目已包含 `render.yaml`，也可以直接使用 Blueprint 部署。

## 文件说明

- `server.js`：Node + Express + Socket.IO 服务端
- `public/`：前端页面与客户端逻辑
- `leaderboard.json`：服务器排行榜（首次运行会自动创建）
- `render.yaml`：Render Blueprint 配置
- `railway.json`：Railway 配置

## 注意

- Render 免费实例文件系统是临时的，所以 `leaderboard.json` 在重建后可能丢失，更正式的版本建议改用数据库
- 这是可玩 beta 的部署版，不是最终成品
