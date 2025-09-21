'use client'

export default function MonoIcon({
  src,
  color,
  size = 28,
  className = '',
}: { src: string; color: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        backgroundColor: color,
        WebkitMask: `url(${src}) no-repeat center / contain`,
        mask: `url(${src}) no-repeat center / contain`,
      }}
    />
  )
}
