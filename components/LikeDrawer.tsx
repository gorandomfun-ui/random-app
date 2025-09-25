'use client'
import { useEffect, useState } from 'react'


type LikeItem = { url: string; ts: number }


export default function LikeDrawer() {
const [open, setOpen] = useState(false)
const [items, setItems] = useState<LikeItem[]>([])


useEffect(() => {
if (open) {
try {
setItems(JSON.parse(localStorage.getItem('likes') || '[]'))
} catch {
setItems([])
}
}
}, [open])


return (
<div className="fixed left-4 top-4 z-40">
<button
onClick={() => setOpen((o) => !o)}
className="rounded-full p-3 shadow-md bg-white/90 backdrop-blur"
aria-label="Likes"
>
{/* eslint-disable-next-line @next/next/no-img-element */}
<img src="/icons/Heart.svg" alt="likes" className="w-6 h-6" />
</button>
{open && (
<div className="mt-2 w-64 max-h-[60vh] overflow-auto rounded-xl shadow-xl bg-white/95 p-3">
<div className="font-medium mb-2">Likes</div>
{items.length === 0 ? (
<div className="text-sm opacity-70">No likes yet</div>
) : (
<ul className="space-y-2">
{items.map((it, i) => (
<li key={i} className="text-sm">
<a className="hover:underline" href={it.url} target="_blank" rel="noreferrer">
{new Date(it.ts).toLocaleString()}
</a>
</li>
))}
</ul>
)}
</div>
)}
</div>
)
}
