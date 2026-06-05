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
        // 年度回忆报告（暗色编辑杂志风）：拉丁大数字衬线 + 中文衬线
        playfair: ['"Playfair Display"', 'Georgia', 'serif'],
        serifcjk: ['"Noto Serif SC"', '"Source Han Serif SC"', '"Songti SC"', '"STSong"', 'serif'],
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
        // 年度回忆报告
        'mem-in': {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(.985)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'mem-aurora': {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(6%,-5%,0) scale(1.18)' },
          '66%': { transform: 'translate3d(-6%,5%,0) scale(1.06)' },
        },
        'mem-twinkle': {
          '0%, 100%': { opacity: '.12', transform: 'scale(.7)' },
          '50%': { opacity: '.9', transform: 'scale(1)' },
        },
        'mem-float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-7px)' },
        },
      },
      animation: {
        'spin-slow': 'spin-slow 10s linear infinite',
        pop: 'pop .18s ease-out',
        'mem-in': 'mem-in .5s cubic-bezier(.22,.61,.36,1) both',
        'mem-aurora': 'mem-aurora 17s ease-in-out infinite',
        'mem-twinkle': 'mem-twinkle 3.4s ease-in-out infinite',
        'mem-float': 'mem-float 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
