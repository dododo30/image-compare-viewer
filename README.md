# 图片对比查看器 (Image Compare Viewer)

一个纯本地的图片查看与对比工具，基于 React + TypeScript + Vite + Tailwind CSS。

## 功能

- **多图对比**：1 / 2 / 4 / 6 宫格布局，最多 6 张图同时对比；支持文件多选与拖拽导入
- **覆盖对比**：两张图叠加，拖动分割线划擦对比 + B 图不透明度溶合
- **缩放平移**：滚轮以鼠标为中心缩放（10%–4000%）、拖动平移、同步/独立缩放切换
- **图片信息**：文件名、尺寸、文件大小、EXIF（曝光时间、ISO、光圈、焦距、相机/镜头、拍摄时间等，基于 exifr）
- **图像统计**：RGB/亮度直方图（对数刻度）、CIE L\*a\*b\*、HSV、HSL 均值与 RGB 均值/标准差；默认全图统计，支持框选区域统计（大图自动抽样）

## 运行

```bash
npm install
npm run dev    # http://localhost:3000/
```

Windows 下也可以直接双击 `启动.bat`（自动检测系统 Node.js 或 Kimi 自带运行时）。

## 构建

```bash
npm run build      # 产物在 dist/
npm run preview    # 预览构建产物
```

## 打包为单文件 EXE

使用 Node.js 24 的 SEA（Single Executable Application）：

```bash
npm run build
node gen-sea-server.cjs          # 生成内嵌 dist 资源的 sea-server.cjs 和 sea-config.json 后：
node --experimental-sea-config sea-config.json
# 复制 node.exe 并用 postject 注入 sea-prep.blob（哨兵串见 Node 官方文档）
```

详见 `gen-sea-server.cjs` 注释。

## 演示模式

访问 `?demo` 自动加载 4 张内置示例图；`?demo&overlay` 直接进入覆盖对比模式。
