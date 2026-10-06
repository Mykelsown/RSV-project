type LiveDotProps = { label?: string }

export default function LiveDot({ label }: LiveDotProps) {
  return (
    <span className="live-dot-wrap">
      <span className="live-dot" aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  )
}