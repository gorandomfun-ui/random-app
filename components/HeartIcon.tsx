'use client'

export default function HeartIcon({
  color,
  size,
  className = '',
}: {
  color: string
  size: number
  className?: string
}) {
  return (
    <svg
      aria-hidden
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 22"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M23.685 7.052c.028-.296.023-.458.023-.458 0-3.359-2.723-6.082-6.082-6.082-2.542 0-4.717 1.561-5.626 3.775-.909-2.214-3.084-3.775-5.626-3.775C3.015.512.292 3.235.292 6.594c0 0-.005.162.023.458.033.445.111.878.235 1.291.663 2.607 3.027 7.783 11.449 13.144 8.423-5.361 10.787-10.537 11.449-13.144.124-.413.202-.846.235-1.291Z" />
    </svg>
  )
}
