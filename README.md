# Universal Farm

一个基于 HTML / JavaScript / Three.js 的宇宙农场原型，包含种田、挖矿、探索和独立的作物数据编辑器。

## 快速开始

游戏需要 Node.js 20+（含 npm）、Python 3 和支持 WebGL 的现代浏览器。

```text
npm install
npm start
```

然后访问服务器输出的地址（默认 `http://localhost:8765/`）。Windows 用户也可以双击 `start.bat`。

运行逻辑测试：

```text
npm test
```

## 种子编辑器

编辑器位于 `UniversalFarmSeedEditor/`，不需要 Node、Python 或 Three.js，直接双击其中的 `index.html` 或 `start.bat` 即可离线使用。

- 用 `npm run editor:sync` 从游戏默认作物目录刷新编辑器快照。
- 编辑器导出的 `crop-catalog.json` 可以在游戏“农场”页签导入。
- 编辑器导出的 `crops.js` 可替换 `src/data/crops.js`，作为新的项目默认图鉴。

## 从其他电脑拉取

本目录就是完整 Git 仓库。克隆后在项目根目录执行 `npm install`，再按上面的命令启动即可。若只需要编辑作物，打开 `UniversalFarmSeedEditor/index.html` 即可。

Git 不同步浏览器 localStorage：游戏存档、导入游戏的自定义图鉴和编辑器草稿不会自动跟随仓库迁移。编辑器的修改请先导出；需要随代码分发的默认图鉴请更新 `src/data/crops.js`，并运行 `npm run editor:sync`。移动编辑器目录后，原地址的浏览器草稿也可能无法自动读取。

首次提交前，使用自己的真实信息设置本仓库身份（不修改全局设置）：

```text
git config user.name "你的名字"
git config user.email "你的提交邮箱"
git add .
git commit -m "Initial import of Universal Farm and seed editor"
```

在 GitHub / GitLab 上创建一个空的远程仓库（不要预先生成 README 等文件），再把远程地址添加为 `origin`：

```text
git remote add origin <你的远程仓库地址>
git push -u origin main
```

之后在其他电脑执行：

```text
git clone <你的远程仓库地址>
cd UniversalFarm
npm install
```
