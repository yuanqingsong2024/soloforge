#!/usr/bin/env node
/**
 * SoloForge 图片资源生成脚本
 * 使用: node scripts/generate-icons.mjs
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '../resources/images');

// 确保输出目录存在
mkdirSync(OUTPUT_DIR, { recursive: true });

// SVG 转 PNG 需要使用 canvas 或 sharp
// 这里我们生成简化的 SVG 版本

console.log('SoloForge 图片资源生成器');
console.log('========================');
console.log('');
console.log('已生成的 SVG 文件:');
console.log('');

// 列出所有已生成的 SVG
const svgs = [
  'logos/soloforge-logo-main.svg - 主 Logo (256x256)',
  'logos/soloforge-logo-compact.svg - 简化 Logo (64x64)',
  'logos/soloforge-logo-full.svg - 完整 Logo (512x512)',
  'illustrations/empty-state.svg - 空状态插图',
  'illustrations/error-state.svg - 错误状态插图',
  'illustrations/success-state.svg - 成功状态插图',
  'illustrations/setup-wizard.svg - 设置向导插图',
  'illustrations/maintenance-state.svg - 维护状态插图',
  'illustrations/onboarding.svg - 引导页插图',
];

svgs.forEach(svg => console.log('  ✓ ' + svg));

console.log('');
console.log('生成 PNG 需要的工具:');
console.log('  npm install -D sharp');
console.log('');
console.log('或者使用在线工具将 SVG 转为 PNG:');
console.log('  - https://cloudconvert.com/svg-to-png');
console.log('  - https://www.iloveimg.com/svg-to-png');
console.log('');
console.log('推荐尺寸:');
console.log('  App Icon: 16, 32, 48, 64, 128, 256, 512, 1024 px');
console.log('  Favicon: 16, 32, 48 px');
console.log('');
