import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/instant-insanity/", // [주의] 여기에 본인의 '레포지토리 이름'을 앞뒤 슬래시와 함께 넣으세요.
})