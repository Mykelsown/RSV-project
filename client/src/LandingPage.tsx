import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Mail, MapPin, Fuel, Menu, X, ShieldCheck, Activity, Landmark, Gauge, Factory,
  Waves, Server, Truck, Database, AlertTriangle, ChevronRight, CheckCircle2,
  Check, CloudUpload, Scale, Lock, MonitorCheck, Play, ArrowUpRight, Ship,
} from 'lucide-react'
import './LandingPage.css'
import RippleSurface from './components/RippleSurface'
import RippleButton from './components/RippleButton'
import IconCircle from './components/IconCircle'
import GlassWidget from './components/GlassWidget'
import Donut from './components/Donut'
import KPITile from './components/KPITile'
import StatusPill from './components/StatusPill'
import LiveDot from './components/LiveDot'
import { useInView } from './components/useInView'
import { useAuth } from './auth/AuthContext'

/* The chart bundle loads only when the dashboard preview approaches the
   viewport, and only once. */
const GoogleChartCard = lazy(() => import('./components/GoogleChartCard'))

/* GitHub brand mark (lucide-react no longer ships brand icons) */
function GitHubMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 1.5A10.5 10.5 0 0 0 1.5 12c0 4.64 3.01 8.58 7.18 9.97.53.1.72-.23.72-.5v-1.79c-2.92.63-3.54-1.24-3.54-1.24-.48-1.21-1.17-1.53-1.17-1.53-.95-.65.07-.64.07-.64 1.06.07 1.61 1.08 1.61 1.08.94 1.6 2.46 1.14 3.06.87.1-.68.37-1.14.66-1.4-2.33-.27-4.78-1.17-4.78-5.19 0-1.15.41-2.08 1.08-2.82-.11-.26-.47-1.33.1-2.77 0 0 .88-.28 2.88 1.08a10 10 0 0 1 5.24 0c2-1.36 2.88-1.08 2.88-1.08.57 1.44.21 2.51.1 2.77.67.74 1.08 1.67 1.08 2.82 0 4.03-2.45 4.91-4.79 5.18.38.32.71.96.71 1.94v2.88c0 .28.19.61.73.5A10.5 10.5 0 0 0 22.5 12 10.5 10.5 0 0 0 12 1.5Z" />
    </svg>
  )
}

const IMAGES = {
  hero: '/images/refinery-hero.jpg',
  tanks: '/images/refinery-tanks.jpg',
  controls: '/images/control-room.jpg',
  gantry: '/images/gantry-trucks.jpg',
}

function Photo({ src, alt, className, eager = false }: { src: string; alt: string; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <div className={`photo-fallback ${className || ''}`} role="presentation" />
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setFailed(true)}
    />
  )
}

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className={`fade-section ${inView ? 'is-in' : ''} ${className}`.trim()}>
      {children}
    </div>
  )
}

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Verified output',
    copy: 'Daily output is reconciled against crude intake and sealed in a hash-chained ledger.',
  },
  {
    icon: Activity,
    title: 'Live data feeds',
    copy: 'Tanker arrivals, unit throughput and gantry loadings stream in as they happen.',
  },
  {
    icon: Landmark,
    title: 'Regulator access',
    copy: 'The NMDPRA gets a read-only portal showing the same verified numbers.',
  },
]

const NAV_SECTIONS = [
  { id: 'home', label: 'Home' },
  { id: 'what-rsv-does', label: 'What RSV does' },
  { id: 'why-rsv', label: 'Why RSV' },
  { id: 'how-it-works', label: 'How it works' },
]

const MARQUEE_PAIRS = [
  {
    problem: 'The regulator publishes 51.5% fulfillment and the refinery has no matching record.',
    solution: 'A shared, signed daily ledger both sides can open.',
  },
  {
    problem: 'Crude cargo counts differ between trading sources and refinery officials.',
    solution: 'Each cargo carries an allocation reference logged at intake.',
  },
  {
    problem: 'Shortfalls are found in quarterly reports.',
    solution: 'Fulfillment is tracked against 35M litres through the day, with same-day alerts.',
  },
  {
    problem: 'Investor due diligence needs auditable production records.',
    solution: 'Reports for any date range with hash chain verification.',
  },
  {
    problem: 'Connecting live sensors takes months.',
    solution: 'A single DataSource interface for every feed, simulated today and live tomorrow.',
  },
]

const SYSTEM_CHIPS = [
  { icon: Waves, label: 'Terminal flow meters' },
  { icon: Server, label: 'Distributed control systems' },
  { icon: Truck, label: 'Gantry controllers' },
  { icon: Database, label: 'ERP and allocation' },
]

const PROCESS_STEPS = [
  {
    icon: CloudUpload,
    title: 'Data arrives',
    copy: 'Sensors and the ingest API push intake, output and loading events through the day.',
  },
  {
    icon: Scale,
    title: 'Output is reconciled',
    copy: 'Raw output is checked against intake, yield and the daily target.',
  },
  {
    icon: Lock,
    title: 'The day is sealed',
    copy: 'The reconciled day is sealed as a hash-chained ledger entry.',
  },
  {
    icon: MonitorCheck,
    title: 'Both sides see it',
    copy: 'The refinery dashboard and the regulatory portal read the same record.',
  },
]

function BackToAppLink({ className, children }: { className?: string; children: ReactNode }) {
  return <Link to="/login" className={className}>{children}</Link>
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function FeatureCard({ icon, title, copy }: { icon: typeof ShieldCheck; title: string; copy: string }) {
  return (
    <div className="lp-feature-card">
      <span className="lp-feature-card__corner" aria-hidden="true">
        <IconCircle icon={icon} tone="light" size={48} iconSize={22} />
      </span>
      <RippleSurface variant="light" className="lp-feature-card__inner" onClick={() => scrollToSection('how-it-works')}>
        <h3>{title}</h3>
        <p>{copy}</p>
        <button type="button" className="lp-feature-card__link" onClick={() => scrollToSection('how-it-works')}>
          Learn more <ArrowUpRight size={16} strokeWidth={1.75} />
        </button>
      </RippleSurface>
    </div>
  )
}

function MarqueePair({ problem, solution }: { problem: string; solution: string }) {
  return (
    <div className="lp-marquee__pair">
      <RippleSurface className="lp-marquee__card lp-marquee__card--problem">
        <IconCircle icon={AlertTriangle} tone="glass" size={30} iconSize={16} />
        <span>{problem}</span>
      </RippleSurface>
      <ChevronRight className="lp-marquee__chevron" size={22} strokeWidth={1.75} />
      <RippleSurface className="lp-marquee__card lp-marquee__card--solution">
        <IconCircle icon={CheckCircle2} tone="glass" size={30} iconSize={16} />
        <span>{solution}</span>
      </RippleSurface>
    </div>
  )
}

function StepItem({ step, index }: { step: (typeof PROCESS_STEPS)[number]; index: number }) {
  return (
    <div className="lp-step">
      <div className="lp-step__circle">
        <IconCircle icon={step.icon} tone="light" size={58} iconSize={22} />
        <span className="lp-step__number">0{index + 1}</span>
      </div>
      <h3>{step.title}</h3>
      <p>{step.copy}</p>
    </div>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const steps = useInView<HTMLDivElement>()
  /* The dashboard preview (and its chart bundle) loads when near viewport. */
  const preview = useInView<HTMLDivElement>({ rootMargin: '320px' })
  const nearPreview = preview.inView


  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const dashboardTarget = user && user.role !== 'regulatory' ? '/dashboard' : user ? '/regulatory' : '/login'

  return (
    <div className="lp" id="home">
      <div className="lp-utility">
        <div className="lp-utility__group">
          <span><MapPin size={14} strokeWidth={1.75} /> Lekki Free Zone, Lagos, Nigeria</span>
          <span><Mail size={14} strokeWidth={1.75} /> Demo and pilot enquiries via the request form</span>
        </div>
        <a href="https://github.com/Mykelsown" target="_blank" rel="noreferrer" aria-label="RSV on GitHub">
          <GitHubMark />
        </a>
      </div>

      <header className={`lp-nav ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="lp-nav__inner">
          <Link to="/" className="lp-nav__brand" onClick={() => setMenuOpen(false)}>
            <span className="lp-logo-mark"><Fuel size={18} strokeWidth={1.75} /></span>
            <span className="lp-nav__wordmark">RSV</span>
          </Link>
          <nav className="lp-nav__links" aria-label="Main">
            {NAV_SECTIONS.map((section) => (
              <button key={section.id} type="button" onClick={() => scrollToSection(section.id)}>{section.label}</button>
            ))}
            <Link to={dashboardTarget}>Dashboard</Link>
          </nav>
          <div className="lp-nav__actions">
            <Link to="/login" className="lp-nav__signin">Sign in</Link>
            <a href="https://github.com/Mykelsown" target="_blank" rel="noreferrer" className="lp-btn lp-btn--solid">Request a demo</a>
            <button type="button" className="lp-nav__menu-btn" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
              {menuOpen ? <X size={20} strokeWidth={1.75} /> : <Menu size={20} strokeWidth={1.75} />}
            </button>
          </div>
        </div>
        <div className={`lp-mobile-menu ${menuOpen ? 'is-open' : ''}`}>
          {NAV_SECTIONS.map((section) => (
            <button key={section.id} type="button" onClick={() => { setMenuOpen(false); scrollToSection(section.id) }}>{section.label}</button>
          ))}
          <Link to={dashboardTarget} onClick={() => setMenuOpen(false)}>Dashboard</Link>
          <Link to="/login" onClick={() => setMenuOpen(false)}>Sign in</Link>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero__bg" aria-hidden="true">
          <Photo src={IMAGES.hero} alt="" className="lp-hero__img" eager />
          <div className="lp-hero__overlay" />
        </div>
        <div className="lp-hero__content">
          <span className="lp-hero__tag"><LiveDot label="Verified refinery data" /></span>
          <h1>Every barrel in and every litre out, on one verified record.</h1>
          <p>
            Between October 2024 and October 2025 the refinery averaged 18 million litres of petrol
            a day against a 35 million litre commitment, according to NMDPRA data. RSV gives the
            refinery and the regulator the same tamper-evident record, updated all day.
          </p>
          <div className="lp-hero__actions">
            <BackToAppLink className="lp-btn lp-btn--solid">See the live demo</BackToAppLink>
            <button type="button" className="lp-btn lp-btn--outline" onClick={() => scrollToSection('how-it-works')}>
              Read how it works
            </button>
          </div>
        </div>
      </section>

      <section className="lp-features" aria-label="What RSV provides">
        <div className="lp-container lp-features__grid">
          {FEATURES.map((feature) => <FeatureCard key={feature.title} {...feature} />)}
        </div>
      </section>

      <section className="lp-about" id="what-rsv-does">
        <div className="lp-container lp-about__grid">
          <Reveal className="lp-about__media">
            <Photo src={IMAGES.tanks} alt="Storage tank farm at the refinery" className="lp-about__img" />
            <RippleSurface variant="light" className="lp-checklist">
              <span className="lp-checklist__title">On the record</span>
              {[
                'Crude intake logged on arrival',
                'Output measured against the 35M litre target',
                'Every truck tied to a distributor',
                'Ledger entries that cannot be edited',
              ].map((item) => (
                <span key={item} className="lp-checklist__item"><Check size={16} strokeWidth={2} /> {item}</span>
              ))}
            </RippleSurface>
          </Reveal>
          <div className="lp-about__copy">
            <div className="lp-eyebrow"><span className="lp-eyebrow__line" aria-hidden="true" /> What RSV does</div>
            <h2>Operational records that hold up under audit</h2>
            <p className="lp-about__pull">One record for the refinery, the regulator and the investor.</p>
            <p>
              Crude cargo arrivals, unit throughput and gantry loadings flow in from the refinery
              floor through one standard interface. RSV reconciles what came in against what came
              out, hour by hour, and flags anything that drifts from the daily commitment.
            </p>
            <p>
              Each verified day is sealed into a hash-chained ledger, so the same numbers reach the
              operations floor, the NMDPRA portal and investor reports without anyone retyping them.
            </p>
            <div className="lp-about__actions">
              <Link to="/login" className="lp-btn lp-btn--solid">See the platform</Link>
              <RippleButtonPlay onClick={() => navigate('/login')} />
            </div>
          </div>
        </div>
      </section>

      <section className="lp-systems">
        <Reveal className="lp-container lp-systems__grid">
          <h2>Connects to the systems a refinery already runs</h2>
          <div className="lp-systems__chips">
            {SYSTEM_CHIPS.map((chip) => (
              <span key={chip.label} className="lp-chip"><IconCircle icon={chip.icon} tone="light" size={34} iconSize={18} /> {chip.label}</span>
            ))}
            <p className="lp-systems__note">Each source plugs in through one standard interface.</p>
          </div>
        </Reveal>
      </section>

      <section className="lp-marquee" id="why-rsv">
        <Reveal>
          <h2>Why RSV</h2>
        </Reveal>
        <div className="lp-marquee__viewport" aria-hidden="false">
          <div className="lp-marquee__track">
            {[0, 1].map((copy) => (
              <div className="lp-marquee__sequence" key={copy} aria-hidden={copy === 1}>
                {MARQUEE_PAIRS.map((pair, index) => <MarqueePair key={index} {...pair} />)}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-process" id="how-it-works">
        <div className="lp-container">
          <Reveal>
            <div className="lp-eyebrow"><span className="lp-eyebrow__line" aria-hidden="true" /> How it works</div>
            <h2>From sensor reading to sealed record, every day</h2>
          </Reveal>
          <div ref={steps.ref} className={`lp-steps ${steps.inView ? 'is-in' : ''}`}>
            <span className="lp-steps__line" aria-hidden="true" />
            {PROCESS_STEPS.map((step, index) => <StepItem key={step.title} step={step} index={index} />)}
          </div>
        </div>
      </section>

      <section className="lp-preview">
        <div className="lp-preview__bg" aria-hidden="true">
          <Photo src={IMAGES.hero} alt="" className="lp-preview__img" />
          <div className="lp-preview__overlay" />
        </div>
        <div className="lp-container lp-preview__inner" ref={preview.ref}>
          <Reveal>
            <h2>See the board the operations team sees.</h2>
            <p className="lp-preview__note">A static preview of the live dashboard with sample data.</p>
            {nearPreview && (
              <div className="lp-preview__frame" aria-hidden="true">
                <Suspense fallback={<div className="lp-preview__fallback" role="status" aria-label="Loading the dashboard preview" /> }>
                  <StaticBoard />
                </Suspense>
              </div>
            )}
            <Link to="/login" className="lp-btn lp-btn--solid">Open the live demo</Link>
          </Reveal>
        </div>
      </section>

      <section className="lp-cta">
        <Reveal>
          <h2>One data feed is enough to start.</h2>
          <p>Connect the gantry loading system and the verified record begins that day.</p>
          <a href="https://github.com/Mykelsown" target="_blank" rel="noreferrer" className="lp-btn lp-btn--inverted">Request a demo</a>
        </Reveal>
      </section>

      <footer className="lp-footer">
        <div className="lp-container lp-footer__grid">
          <div>
            <span className="lp-logo-mark"><Fuel size={18} strokeWidth={1.75} /></span>
            <h3>RSV</h3>
            <p>Real-Time Refinery Output and Crude Supply Verification, a shared tamper-evident record of what the refinery produced and who took delivery.</p>
          </div>
          <div>
            <span className="lp-footer__heading">Quick links</span>
            {NAV_SECTIONS.map((section) => (
              <button key={section.id} type="button" onClick={() => scrollToSection(section.id)}>{section.label}</button>
            ))}
          </div>
          <div>
            <span className="lp-footer__heading">Elsewhere</span>
            <a href="https://github.com/Mykelsown" target="_blank" rel="noreferrer">github.com/Mykelsown</a>
          </div>
        </div>
        <div className="lp-footer__base">
          <span>Built by Samuel Micheal Pelumi, Lagos</span>
        </div>
      </footer>
    </div>
  )
}

/* Static preview sample data shaped like live days: fulfillment close to
   the 35 million litre commitment with one shortfall day. */
const PREVIEW_TREND = [
  { day: '07 Oct', percent: 90.3 },
  { day: '08 Oct', percent: 92.2 },
  { day: '09 Oct', percent: 62.0 },
  { day: '10 Oct', percent: 88.6 },
  { day: '11 Oct', percent: 89.2 },
  { day: '12 Oct', percent: 62.0 },
  { day: '13 Oct', percent: 104.3 },
]

/* Non-interactive scaled preview of the real dashboard, same components. */
function StaticBoard() {
  const trendRows: unknown[][] = [
    ['Day', 'Fulfillment', { type: 'string', role: 'style' }, 'Target'],
    ...PREVIEW_TREND.map((entry) => [
      entry.day,
      entry.percent,
      `color: ${entry.percent >= 95 ? '#3ccf82' : entry.percent >= 75 ? '#e0a21f' : '#d94452'};`,
      100,
    ]),
  ]
  return (
    <div className="lp-board" style={{ pointerEvents: 'none', userSelect: 'none' }}>
      <div className="lp-board__header glass-surface">
        <span className="lp-logo-mark"><Fuel size={16} strokeWidth={1.75} /></span>
        <div><strong>Good morning, operations</strong><span>Tue 14 Oct, 06:40 WAT</span></div>
        <StatusPill status="PARTIAL" />
      </div>
      <div className="lp-board__grid">
        <GlassWidget icon={Gauge} title="Today at a glance" className="lp-widget-tall">
          <Donut id="preview-fulfillment" value={51.5} size={132} stroke={11}>
            <strong>51.5%</strong>
            <span>of 35M litres</span>
          </Donut>
          <StatusPill status="PARTIAL" />
          <div className="lp-widget-minis">
            <KPITile label="Crude intake" value={224600} unit="barrels" tone="blue" size="sm" />
            <KPITile label="Actual output" value={18032000} unit="litres" tone="green" size="sm" />
            <KPITile label="Trucks loaded" value={186} unit="today" tone="white" size="sm" />
          </div>
        </GlassWidget>
        <GlassWidget icon={Ship} title="Live activity" badge="3">
          {[
            { icon: Ship, text: 'Terminal meter reading: +163 bbl Bonny Light via MT BENIN QUEEN', time: '4 min ago' },
            { icon: Truck, text: 'Zenith loaded 33,100L of petrol at gantry 2', time: '9 min ago' },
            { icon: Factory, text: 'Combined output reached 18,032,000L', time: '14 min ago' },
          ].map((event) => (
            <div key={event.text} className="lp-row">
              <IconCircle icon={event.icon} tone="glass" size={28} iconSize={16} />
              <span className="lp-row__text">{event.text}</span>
              <span className="lp-row__time">{event.time}</span>
            </div>
          ))}
        </GlassWidget>
        <GoogleChartCard
          icon={Activity}
          title="7 day fulfillment trend"
          subtitle="Sample data: fulfillment against the 100 percent target"
          ariaLabel="Static sample column chart of daily fulfillment for seven days with a dashed target line at 100 percent"
          chartType="ComboChart"
          data={trendRows}
          className="lp-widget-trend"
          options={{
            series: {
              0: { type: 'bars', color: '#3ccf82' },
              1: { type: 'line', color: '#7dd3fc', lineDashStyle: [8, 6], pointSize: 0, lineWidth: 2 },
            },
            barGap: '26%',
            vAxis: { viewWindow: { min: 0, max: 120 }, format: "#'%'", minValue: 0, maxValue: 120 },
          } as Record<string, unknown>}
        />
        <GlassWidget icon={Factory} title="Production units" className="lp-widget-trend">
          {['CDU-1', 'CDU-2', 'CDU-3'].map((unit, index) => {
            const yieldPercent = [62, 45, 38][index]
            return (
              <div key={unit} className="lp-unit-row">
                <span className="lp-row__text">{unit}</span>
                <span className="lp-unit-row__bar"><i style={{ width: `${yieldPercent}%` }} /></span>
                <strong>{yieldPercent}%</strong>
              </div>
            )
          })}
        </GlassWidget>
      </div>
    </div>
  )
}

function RippleButtonPlay({ onClick }: { onClick: () => void }) {
  return (
    <RippleButton type="button" className="lp-play-btn" aria-label="Open the dashboard preview" onClick={onClick}>
      <Play size={18} strokeWidth={1.75} />
    </RippleButton>
  )
}
