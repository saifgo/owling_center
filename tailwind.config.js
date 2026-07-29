/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          50: '#f4f6f8',
          100: '#e8ecef',
          200: '#d1d9e0',
          800: '#1e2936',
          900: '#121a24',
          950: '#0b1118'
        },
        accent: {
          DEFAULT: '#2dd4a8',
          dim: '#1a9e7a',
          muted: '#0f3d32'
        },
        warn: '#e8a838',
        danger: '#e85d5d'
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'Consolas', 'monospace'],
        display: ['"Space Grotesk"', 'Segoe UI', 'sans-serif']
      },
      boxShadow: {
        panel: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)'
      }
    }
  },
  plugins: []
}
