import { useRef, useState } from 'react'
import Icon from '../ui/Icon'
import { uploadPhoto } from '../api'

interface Props {
  photos: string[]
  onChange: (photos: string[]) => void
  max?: number
}

const MAX_DIM = 1280 // 长边压到 1280px

export default function PhotoPicker({ photos, onChange, max = 5 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const room = max - photos.length
    const toUpload = files.slice(0, room)
    setUploading(toUpload.length)
    const urls: string[] = []
    for (const f of toUpload) {
      try {
        const blob = await compress(f, MAX_DIM)
        const form = new FormData()
        form.append('file', blob, 'pic.jpg')
        const { url } = await uploadPhoto(form)
        urls.push(url)
      } catch (err) {
        console.error('upload failed', err)
      }
      setUploading((c) => c - 1)
    }
    onChange([...photos, ...urls])
  }

  function remove(u: string) {
    onChange(photos.filter((x) => x !== u))
  }

  return (
    <div className="grid grid-cols-5 gap-2">
      {photos.map((u) => (
        <div className="relative aspect-square" key={u}>
          <img src={u} className="w-full h-full object-cover rounded-lg border-2 border-on-surface" />
          <button
            onClick={() => remove(u)}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-on-surface text-white text-xs flex items-center justify-center border-2 border-white"
          >
            ✕
          </button>
        </div>
      ))}
      {Array.from({ length: uploading }).map((_, i) => (
        <div
          key={`u${i}`}
          className="aspect-square w-full rounded-lg border-2 border-dashed border-on-surface/40 flex items-center justify-center text-on-surface-variant animate-pulse"
        >
          ↑
        </div>
      ))}
      {photos.length + uploading < max && (
        <button
          onClick={() => inputRef.current?.click()}
          className="aspect-square w-full rounded-lg border-2 border-dashed border-on-surface/50 bg-white/50 flex flex-col items-center justify-center text-on-surface-variant press-sm"
        >
          <Icon name="add_a_photo" className="text-xl" />
          <span className="text-[10px] font-bold mt-0.5">{photos.length === 0 ? '拍照 / 选图' : '加一张'}</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={handlePick} className="hidden" />
    </div>
  )
}

async function compress(file: File, maxDim: number): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const img = await loadImage(file)
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  if (scale === 1 && file.size < 600 * 1024) return file
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b || file), 'image/jpeg', 0.85)
  })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(img.src)
      resolve(img)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}
