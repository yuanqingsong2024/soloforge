#!/usr/bin/env node
/**
 * SoloForge PNG 图标生成脚本
 * 使用: node scripts/generate-png-icons.mjs
 * 
 * 需要先安装 sharp: npm install -D sharp
 */

import sharp from 'sharp';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESOURCES_DIR = join(__dirname, '../resources/images');
const OUTPUT_DIR = join(RESOURCES_DIR);
const SVG_DIR = join(RESOURCES_DIR, 'logos');

// 确保输出目录存在
mkdirSync(join(OUTPUT_DIR, 'icons'), { recursive: true });

/**
 * 将 SVG 转换为 PNG
 */
async function svgToPng(svgPath, outputPath, width, height) {
  try {
    const svgBuffer = readFileSync(svgPath);
    await sharp(svgBuffer)
      .resize(width, height)
      .png()
      .toFile(outputPath);
    console.log(`  ✓ ${width}x${height}: ${basename(outputPath)}`);
  } catch (err) {
    console.error(`  ✗ ${width}x${height}: ${err.message}`);
  }
}

/**
 * 生成 ICO 文件 (多尺寸 PNG 合并)
 * 注意: 真正的 ICO 需要特殊格式，这里生成多个尺寸的 PNG
 */
async function generateIcons() {
  console.log('\n🎨 SoloForge 图标生成器\n');
  console.log('=' .repeat(50));
  
  // 图标尺寸配置
  const sizes = {
    appIcon: [16, 32, 48, 64, 128, 256, 512, 1024],
    favicon: [16, 32, 48],
  };
  
  const mainLogoSvg = join(SVG_DIR, 'soloforge-logo-main.svg');
  const compactLogoSvg = join(SVG_DIR, 'soloforge-logo-compact.svg');
  
  if (!existsSync(mainLogoSvg)) {
    console.error('错误: 找不到主 Logo SVG 文件');
    console.log(`  期望路径: ${mainLogoSvg}`);
    return;
  }
  
  console.log('\n📱 生成 App Icon...\n');
  
  // 生成 App Icon
  for (const size of sizes.appIcon) {
    await svgToPng(
      mainLogoSvg,
      join(OUTPUT_DIR, 'icons', `icon-${size}x${size}.png`),
      size,
      size
    );
  }
  
  console.log('\n🌐 生成 Favicon...\n');
  
  // 生成 Favicon
  for (const size of sizes.favicon) {
    await svgToPng(
      compactLogoSvg,
      join(OUTPUT_DIR, 'icons', `favicon-${size}x${size}.png`),
      size,
      size
    );
  }
  
  console.log('\n📦 生成 ICO 所需尺寸...\n');
  
  // ICO 格式通常需要 16, 32, 48, 256
  const icoSizes = [16, 32, 48, 256];
  for (const size of icoSizes) {
    await svgToPng(
      compactLogoSvg,
      join(OUTPUT_DIR, 'icons', `favicon-${size}x${size}.png`),
      size,
      size
    );
  }
  
  console.log('\n' + '=' .repeat(50));
  console.log('✨ 图标生成完成!\n');
  console.log('输出目录:', join(OUTPUT_DIR, 'icons'));
  console.log('\n生成的文件:');
  console.log('  - icon-*.png (App Icon 多尺寸)');
  console.log('  - favicon-*.png (浏览器标签图标)');
  console.log('\n下一步:');
  console.log('  1. 使用 https://favicon.io/convert-io/ 将 PNG 转为 ICO');
  console.log('  2. 复制到 build/ 目录替换现有图标');
  console.log('  3. 更新 package.json 中的 build 配置\n');
}

// 运行
generateIcons().catch(console.error);
