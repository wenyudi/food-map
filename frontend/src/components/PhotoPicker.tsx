import { useRef, useState } from 'react'
import axios from 'axios'

interface Props {
  photos: string[]
  onChange: (photos: string[]) => void
  max?: number
}

const MAX_DIM = 1280  // 长边压到 1280px

export default function PhotoPicker({ photos, onChange, max = 5 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''  // 允许重选同一张
    if (!files.length) return

    const room = max - photos.length
    const toUpload = files.slice(0, room)
    setUploading(toUpload.length)

    const urls: string[] = []
    for (const f of toUpload) {
      try {
        const blob = await compress(f, MAX_DIM)
        const form = new FormData()
        form.append('file', blob, `pic.jpg`)
        const r = await axios.post<{ url: string }>('/api/upload', form)
        urls.push(r.data.url)
      } catch (err) {
        console.error('upload failed', err)
      }
      setUploading(c => c - 1)
    }
    onChange([...photos, ...urls])
  }

  function remove(u: string) {
    onChange(photos.filter(x => x !== u))
  }

  return (
    <div className="photo-picker">
      <div className="photo-grid">
        {photos.map(u => (
          <div className="photo-tile" key={u}>
            <img src={u} />
            <button className="remove" onClick={() => remove(u)}>✕</button>
          </div>
        ))}
        {Array.from({ length: uploading }).map((_, i) => (
          <div className="photo-tile uploading" key={`u${i}`}>↑</div>
        ))}
        {photos.length + uploading < max && (
          <button className="photo-tile add" onClick={() => inputRef.current?.click()}>
            <span>📷</span>
            <small>{photos.length === 0 ? '拍照 / 选图' : '加一张'}</small>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handlePick}
        style={{ display: 'none' }}
      />
    </div>
  )
}

async function compress(file: File, maxDim: number): Promise<Blob> {
  // 不是图就原样
  if (!file.type.startsWith('image/')) return file

  const img = await loadImage(file)
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  if (scale === 1 && file.size < 600 * 1024) return file  // 小图不压

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  return new Promise<Blob>(resolve => {
    canvas.toBlob(b => resolve(b || file), 'image/jpeg', 0.85)
  })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(img.src); resolve(img) }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}
