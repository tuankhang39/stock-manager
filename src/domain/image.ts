/** Đọc ảnh, thu nhỏ (cạnh dài tối đa maxSize) và nén JPEG để tiết kiệm dung lượng lưu trữ. */
export function readImageAsDataUrl(file: File, maxSize = 1400, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Không đọc được ảnh'))
    reader.onload = () => {
      const original = String(reader.result)
      // GIF/SVG giữ nguyên (không nén để khỏi mất hoạt ảnh / vector).
      if (/^data:image\/(gif|svg)/i.test(original)) {
        resolve(original)
        return
      }
      const img = new Image()
      img.onerror = () => resolve(original)
      img.onload = () => {
        const longest = Math.max(img.width, img.height, 1)
        const scale = Math.min(1, maxSize / longest)
        if (scale === 1 && file.size < 400 * 1024) {
          resolve(original)
          return
        }
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(original)
          return
        }
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = original
    }
    reader.readAsDataURL(file)
  })
}
