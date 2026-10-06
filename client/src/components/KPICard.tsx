type KPICardProps = {
  label: string
  value: string
  unit: string
  colorVariant?: 'blue' | 'text' | 'wine' | 'green' | 'amber'
}

export default function KPICard({ label, value, unit, colorVariant = 'text' }: KPICardProps) {
  return (
    <section className="kpi-card">
      <div className="kpi-card__label">{label}</div>
      <div className={`kpi-card__value kpi-card__value--${colorVariant}`}>{value}</div>
      <div className="kpi-card__unit">{unit}</div>
    </section>
  )
}