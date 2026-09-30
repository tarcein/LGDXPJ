const directUploadTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const originalSizeLimit = 25 * 1024 * 1024
const normalizeAbove = 2.5 * 1024 * 1024
const maxEdge = 2400

const loadImage = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진 형식을 읽을 수 없어요. JPG 또는 PNG로 다시 저장해 선택해주세요.')) }
  image.src = url
})

const jpegBlob = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('사진을 업로드용으로 변환하지 못했어요.')), 'image/jpeg', quality)
})

export async function prepareOcrPhoto(file: File): Promise<File> {
  const type = file.type.toLowerCase()
  const imageExtension = /\.(?:heic|heif|jpe?g|png|webp)$/i.test(file.name)
  if ((!type.startsWith('image/') && !imageExtension) || file.size > originalSizeLimit) {
    throw new Error('25MB 이하 사진을 선택해주세요.')
  }
  if (directUploadTypes.has(type) && file.size <= normalizeAbove) return file

  const image = await loadImage(file)
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('사진을 업로드용으로 변환하지 못했어요.')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const blob = await jpegBlob(canvas, 0.9)
  const name = file.name.replace(/\.[^.]+$/, '') || 'notice'
  return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified })
}
