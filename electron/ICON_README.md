# 图标说明

由于 ICO 文件是二进制格式，你需要手动准备图标文件。

## 快速创建图标的方法：

### 方法 1：在线转换
1. 访问 https://convertio.co/zh/png-ico/ 或 https://icoconvert.com/
2. 上传一张 256x256 的 PNG 图片
3. 下载转换后的 ICO 文件
4. 重命名为 `icon.ico` 放到 `electron/` 目录

### 方法 2：使用 ImageMagick
```bash
magick input.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

### 方法 3：使用在线图标生成器
- https://www.favicon.cc/ （可以手绘）
- https://favicon.io/ （从文字/emoji生成）

## 推荐图标设计

可以使用以下 emoji 或类似风格的图标：
🎬 🎭 🎨 🎪 🎫 🎟️ 🎞️ 🎥 📽️ 🎦

## 文件位置

```
ai-animation-studio/
├── electron/
│   ├── main.js
│   ├── preload.js
│   ├── splash.html
│   └── icon.ico          <-- 放这里
```

## 多平台图标

| 平台 | 文件名 | 尺寸 |
|------|--------|------|
| Windows | icon.ico | 256x256 |
| macOS | icon.icns | 512x512 |
| Linux | icon.png | 512x512 |

## 临时解决方案

如果没有准备图标，打包时会使用 Electron 默认图标。
