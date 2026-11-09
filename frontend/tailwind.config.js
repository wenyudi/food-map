/** @type {import('tailwindcss').Config} */
// 吃了么 · 暖纸质感 —— 品牌色不变（番茄橙 + 奶油底），去掉粗描边硬阴影，改柔和分层 + 暖色调阴影
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#faf6f0',              // 暖纸底
        'surface-2': '#f3ece3',          // 下沉面（输入框 / 次级块）
        line: '#ece3d8',                 // 发丝分隔线
        'on-surface': '#2b1f16',         // 深咖（主文字）
        'on-surface-variant': '#766657', // 弱化文字（小字也要过 4.5:1）
        primary: '#e65c3c',              // 番茄橙（唯一主强调色）
        'primary-dark': '#c2452a',        // 小字 / 浅底上的橙
        'primary-soft': '#fdebe5',
        accent: '#f4b740',               // 金黄（星标 / 想再来，少量点缀）
        'accent-soft': '#fdf3dc',
        // 状态语义色：降饱和，只出现在小面积标记上
        sage: '#5fa777',                 // 营业中 / 已兑现（圆点、外圈）
        'sage-ink': '#3c7f55',           // 同色系文字
        'sage-soft': '#e6f2e9',
        rose: '#e5788f',                 // 种草 / 想去（圆点、外圈）
        'rose-ink': '#b9476a',           // 同色系文字
        'rose-soft': '#fce8ec',
        'amber-ink': '#96660a',          // 金黄同色系文字
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.75rem',
        full: '9999px',
      },
      fontFamily: {
        // 正文 / 标题统一走系统中文黑体（iOS 苹方、安卓各家黑体），清爽不幼稚
        sans: ['-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"HarmonyOS Sans SC"', '"MiSans"', '"Noto Sans SC"', '"Microsoft YaHei"', 'sans-serif'],
        headline: ['-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"HarmonyOS Sans SC"', '"MiSans"', '"Noto Sans SC"', '"Microsoft YaHei"', 'sans-serif'],
        // 站酷快乐体只留给品牌时刻（字标 / 回忆报告大字）
        display: ['"ZCOOL KuaiLe"', '"PingFang SC"', 'sans-serif'],
        num: ['Fredoka', '-apple-system', '"PingFang SC"', 'sans-serif'], // 大数字
      },
      fontSize: {
        'headline-sm': '1.5rem',
      },
      boxShadow: {
        // 阴影统一带暖棕色调，光源在正上方
        soft: '0 1px 2px rgba(83,52,26,.05), 0 2px 8px -2px rgba(83,52,26,.06)',
        card: '0 1px 2px rgba(83,52,26,.04), 0 8px 24px -8px rgba(83,52,26,.14)',
        float: '0 2px 6px rgba(83,52,26,.08), 0 16px 36px -12px rgba(83,52,26,.32)',
        glow: '0 8px 20px -6px rgba(230,92,60,.55), inset 0 1px 0 rgba(255,255,255,.25)',
        sheet: '0 -12px 40px -12px rgba(83,52,26,.28)',
        ring: '0 0 0 4px rgba(230,92,60,.16)',
      },
      zIndex: {
        map: '400',
        'map-ui': '450',
        'map-toast': '500',
        tabbar: '1100',
        compose: '1150',
        sheet: '1200',
        overlay: '1300',
        toast: '1500',
        lightbox: '2000',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(.34,1.56,.64,1)',
        'out-expo': 'cubic-bezier(.16,1,.3,1)',
      },
      keyframes: {
        'spin-slow': { to: { transform: 'rotate(360deg)' } },
        pop: { '0%': { transform: 'scale(.8)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-out': { from: { opacity: '1' }, to: { opacity: '0' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(.86)' },
          '60%': { opacity: '1', transform: 'scale(1.03)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'sheet-down': { to: { transform: 'translateY(105%)' } },
        'screen-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'toast-in': { from: { opacity: '0', transform: 'translate(-50%, 12px) scale(.96)' }, to: { opacity: '1', transform: 'translate(-50%, 0) scale(1)' } },
        'toast-out': { to: { opacity: '0', transform: 'translate(-50%, 8px) scale(.96)' } },
        shimmer: { from: { backgroundPosition: '150% 0' }, to: { backgroundPosition: '-50% 0' } },
        bob: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        wiggle: { '0%,100%': { transform: 'rotate(0)' }, '25%': { transform: 'rotate(-12deg)' }, '75%': { transform: 'rotate(12deg)' } },
        'peek-in': { from: { opacity: '0', transform: 'translateY(28px) scale(.97)' }, to: { opacity: '1', transform: 'none' } },
        'peek-out': { to: { opacity: '0', transform: 'translateY(calc(100% + 40px))' } },
        grow: { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        'story-next': { from: { opacity: '0', transform: 'translateX(48px) scale(.96)' }, to: { opacity: '1', transform: 'none' } },
        'story-prev': { from: { opacity: '0', transform: 'translateX(-48px) scale(.96)' }, to: { opacity: '1', transform: 'none' } },
        drift: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(40px,60px) scale(1.15)' } },
        'bob-x': { '0%,100%': { transform: 'translateX(0)' }, '50%': { transform: 'translateX(4px)' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '20%,60%': { transform: 'translateX(-5px)' }, '40%,80%': { transform: 'translateX(5px)' } },
        twinkle: { '0%,100%': { transform: 'scale(1) rotate(0)', opacity: '1' }, '50%': { transform: 'scale(.82) rotate(18deg)', opacity: '.75' } },
      },
      // 入场动画一律 backwards：结束后不残留 transform，不会压住 hover / 按压缩放；离场动画用 forwards
      animation: {
        'spin-slow': 'spin-slow 10s linear infinite',
        pop: 'pop-in .42s cubic-bezier(.34,1.56,.64,1) backwards',
        'fade-in': 'fade-in .3s ease-out backwards',
        'fade-out': 'fade-out .24s ease-in both',
        'fade-up': 'fade-up .5s cubic-bezier(.16,1,.3,1) backwards',
        'pop-in': 'pop-in .42s cubic-bezier(.34,1.56,.64,1) backwards',
        // backwards：动画结束后不残留 transform，否则会盖住手势拖拽的内联位移
        'sheet-up': 'sheet-up .5s cubic-bezier(.16,1,.3,1) backwards',
        'sheet-down': 'sheet-down .26s cubic-bezier(.4,0,1,1) forwards',
        'screen-in': 'screen-in .36s cubic-bezier(.16,1,.3,1) backwards',
        'toast-in': 'toast-in .36s cubic-bezier(.34,1.56,.64,1) backwards',
        'toast-out': 'toast-out .22s ease-in both',
        'peek-in': 'peek-in .45s cubic-bezier(.16,1,.3,1) backwards',
        'peek-out': 'peek-out .22s cubic-bezier(.4,0,1,1) forwards',
        shimmer: 'shimmer 1.4s ease-in-out infinite',
        bob: 'bob 2.6s ease-in-out infinite',
        wiggle: 'wiggle .5s ease-in-out',
        shake: 'shake .4s ease-in-out',
        twinkle: 'twinkle 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
