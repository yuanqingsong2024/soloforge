/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // ============================================
      // SoloForge Design System - 设计令牌
      // ============================================
      
      // 颜色系统 - 与 CSS Variables 保持同步
      colors: {
        // 基础色
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        
        // 次级色
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        
        // 卡片
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        
        // 弹层
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        
        // 边框与输入
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        
        // 主色
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        
        // 次级
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        
        // 强调
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        
        // 状态色
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        
        // Google 品牌色
        'google-blue': 'hsl(var(--google-blue))',
        'google-red': 'hsl(var(--google-red))',
        'google-yellow': 'hsl(var(--google-yellow))',
        'google-green': 'hsl(var(--google-green))',
      },
      
      // 圆角系统 - 统一 4 档
      borderRadius: {
        'none': '0',
        'sm': 'calc(var(--radius) * 0.5)',     // 4px
        'DEFAULT': 'var(--radius)',               // 8px
        'md': 'calc(var(--radius) * 1.5)',      // 12px
        'lg': 'calc(var(--radius) * 2)',         // 16px
        'xl': 'calc(var(--radius) * 3)',         // 24px
        '2xl': 'calc(var(--radius) * 4)',        // 32px
        'full': '9999px',
      },
      
      // 阴影系统 - 4 档精细阴影
      boxShadow: {
        'subtle': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'sm': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'DEFAULT': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        'md': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        'lg': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
        'xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
        'inner': 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
        // Workshop 风格阴影
        'workshop-sm': 'var(--shadow-sm)',
        'workshop-md': 'var(--shadow-md)',
        'workshop-lg': 'var(--shadow-lg)',
        'workshop-xl': 'var(--shadow-xl)',
      },
      
      // 间距系统 - 8px 网格
      spacing: {
        'spacing-xs': 'var(--spacing-xs)',   // 8px
        'spacing-sm': 'var(--spacing-sm)',   // 12px
        'spacing-md': 'var(--spacing-md)',   // 16px
        'spacing-lg': 'var(--spacing-lg)',   // 24px
        'spacing-xl': 'var(--spacing-xl)',   // 32px
        'spacing-2xl': 'var(--spacing-2xl)', // 48px
      },
      
      // 动画
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'fade-in-up': 'fadeInUp 0.3s ease-out',
        'fade-in-down': 'fadeInDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'bounce-soft': 'bounceSoft 0.5s ease-out',
      },
      
      // 关键帧动画
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        bounceSoft: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      
      // 过渡效果
      transitionDuration: {
        'fast': '150ms',
        'DEFAULT': '200ms',
        'slow': '300ms',
        'slower': '500ms',
      },
      
      transitionTimingFunction: {
        'ease-out': 'cubic-bezier(0.33, 1, 0.68, 1)',
        'ease-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      
      // 动效缓动
      transitionProperty: {
        'colors': 'color, background-color, border-color, text-decoration-color, fill, stroke',
        'opacity': 'opacity',
        'shadow': 'box-shadow',
        'transform': 'transform',
        'all': 'all',
      },
    },
  },
  plugins: [],
}
