/** @type {import('tailwindcss').Config} */
// 吃了么 · 鲜活波普暖橙 —— token 取自 Stitch 设计系统（assets/9250405431402108743）
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#fcf6ed',          // 暖奶油背景
        'on-surface': '#3d2b1a',     // 咖啡棕（描边 / 主文字）
        'on-surface-variant': '#8a7560', // 弱化文字
        primary: '#ef6c4f',          // 暖橙（CTA / 高亮 tab）
        'primary-dark': '#d84c30',   // 深橙（次强调数字）
        accent: '#ffc857',           // 金黄（星标 / 想再来）
        'green-accent': '#4CAF50',   // 花费绿
        tertiary: '#f9c8c0',         // 浅粉（点缀）
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '1rem',
        xl: '1.5rem',
        '2xl': '1.75rem',
        full: '9999px',
      },
      fontFamily: {
        // 中文 headline 用站酷快乐体（敦实可爱），Public Sans 仅作拉丁回退
        headline: ['"ZCOOL KuaiLe"', '"Public Sans"', '"PingFang SC"', 'sans-serif'],
        display: ['"ZCOOL KuaiLe"', '"Public Sans"', '"PingFang SC"', 'sans-serif'],
        body: ['"Plus Jakarta Sans"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        label: ['"Public Sans"', '"PingFang SC"', 'sans-serif'],
        num: ['Fredoka', '"Plus Jakarta Sans"', 'sans-serif'], // 大数字
      },
      fontSize: {
        'headline-sm': '1.5rem',
      },
      boxShadow: {
        // 贴纸硬阴影（无模糊）
        sticker: '3px 3px 0px 0px rgba(61,43,26,1)',
        'sticker-sm': '2px 2px 0px 0px rgba(61,43,26,1)',
        'sticker-lg': '4px 4px 0px 0px rgba(61,43,26,1)',
        'sticker-top': '0px -4px 0px 0px rgba(61,43,26,1)',
      },
      keyframes: {
        'spin-slow': { to: { transform: 'rotate(360deg)' } },
        pop: { '0%': { transform: 'scale(.8)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
      },
      animation: {
        'spin-slow': 'spin-slow 10s linear infinite',
        pop: 'pop .18s ease-out',
      },
    },
  },
  plugins: [],
}
