# SoloForge 图片素材清单

## 📁 目录结构

```
resources/images/
├── logos/                           # Logo 文件
│   ├── soloforge-logo-main.svg     # 主 Logo (256x256)
│   ├── soloforge-logo-compact.svg  # 简化 Logo (64x64)
│   └── soloforge-logo-full.svg     # 完整品牌 Logo (512x512)
│
├── illustrations/                   # 插图文件
│   ├── empty-state.svg             # 空状态插图
│   ├── error-state.svg             # 错误状态插图
│   ├── success-state.svg           # 成功状态插图
│   ├── setup-wizard.svg           # 设置向导插图
│   ├── maintenance-state.svg       # 维护状态插图
│   └── onboarding.svg              # 引导页插图
│
└── README.md                        # 本文件
```

## 🎨 Logo 设计说明

### 设计理念
- **名称**: SoloForge (Solo + Forge)
- **寓意**: 独立锻造，专注打造精品
- **核心元素**: 火焰 (Forge) + 锤子 (Hammer)

### 配色方案
| 颜色 | Hex | 用途 |
|------|-----|------|
| Google Blue | #4285F4 | 主色调 |
| Google Green | #34A853 | 辅助色 |
| Google Yellow | #FBBC05 | 强调色 |
| Deep Blue | #1a1a2e | 深色元素 |
| Flame Orange | #FF6B35 | 火焰色 |

### 文件规格

| 文件 | 尺寸 | 用途 |
|------|------|------|
| `soloforge-logo-main.svg` | 256x256 | 侧边栏、启动页 |
| `soloforge-logo-compact.svg` | 64x64 | 收起侧边栏 |
| `soloforge-logo-full.svg` | 512x512 | 欢迎页、品牌展示 |

## 🖼️ 插图设计说明

### 通用规格
- **画布尺寸**: 400x300
- **风格**: 扁平化 + 渐变
- **配色**: 与 Logo 保持一致

### 各插图用途

| 插图 | 用途场景 |
|------|----------|
| `empty-state.svg` | 工单为空、审批为空、无数据 |
| `error-state.svg` | 加载失败、网络错误 |
| `success-state.svg` | 操作成功确认 |
| `setup-wizard.svg` | AutoSetupWizard 页面 |
| `maintenance-state.svg` | 系统维护中 |
| `onboarding.svg` | 首次使用引导页 |

## 📦 生成 PNG 文件

SVG 文件需要转换为 PNG 用于以下场景:

### App Icon (应用图标)
需要以下尺寸:
- [ ] 16x16.png
- [ ] 32x32.png
- [ ] 48x48.png
- [ ] 64x64.png
- [ ] 128x128.png
- [ ] 256x256.png
- [ ] 512x512.png
- [ ] 1024x1024.png

### Favicon (浏览器标签)
需要以下尺寸:
- [ ] favicon-16x16.png
- [ ] favicon-32x32.png
- [ ] favicon-48x48.png
- [ ] favicon.ico (多尺寸合并)

## 🔧 生成工具

### 使用 sharp (Node.js)
```bash
# 安装依赖
npm install -D sharp

# 运行生成脚本
node scripts/generate-icons.mjs
```

### 在线转换工具
- [CloudConvert](https://cloudconvert.com/svg-to-png)
- [ILoveIMG](https://www.iloveimg.com/svg-to-png)
- [Favicon Generator](https://www.favicon.cc/)

## 📝 使用方式

在 React 组件中引用:

```tsx
import LogoMain from '../../resources/images/logos/soloforge-logo-main.svg';
import EmptyState from '../../resources/images/illustrations/empty-state.svg';

// 使用
<img src={LogoMain} alt="SoloForge Logo" />
```

或使用 CSS:

```css
.logo {
  background-image: url('../../resources/images/logos/soloforge-logo-main.svg');
  background-size: contain;
  background-repeat: no-repeat;
}
```

## 🎯 待完成

- [ ] 生成所有 PNG 尺寸文件
- [ ] 生成 ICO 格式 favicon
- [ ] 生成 Apple Touch Icon
- [ ] 生成 Windows 磁贴图标
- [ ] 创建深色模式版本
- [ ] 考虑无障碍 (alt 文本)
