import { Link } from 'react-router-dom'
import LiveDot from './components/LiveDot'
import './LandingPage.css'

const problems = [
  ['NMDPRA publishes 51.5% fulfillment. Dangote has no verified counter-record.', 'Tamper-evident daily output ledger. Both parties read the same signed record.'],
  ['Crude allocation dispute: trading sources report 7 cargoes, refinery officials say otherwise.', 'Every cargo allocation carries a reference number logged at intake. Discrepancies surface in real time.'],
  ['Production shortfalls discovered in quarterly reports, not the morning they happen.', 'Fulfillment is tracked against the 35M litre target every 30 minutes. Alerts fire the same day.'],
  ['IPO due diligence requires auditable production records. Spreadsheets do not survive scrutiny.', 'Cryptographically verified reports covering any date range, generated in one click.'],
  ['Connecting real IoT sensors to a new system requires months of integration work.', "RSV's DataSource interface means any live feed connects by implementing one Go interface."],
]

const features = [
  { icon: 'tanker', title: 'Crude intake, recorded as it arrives', description: 'Every tanker arrival is logged with volume, crude type, source country, and allocation reference. The terminal sensor feed connects via a single API endpoint.' },
  { icon: 'balance', title: 'Output reconciled against commitment', description: 'Actual production unit throughput is measured against the expected yield from crude intake and the 35 million litre daily target. Shortfalls are flagged the same morning they occur.' },
  { icon: 'truck', title: 'Every litre tracked to its distributor', description: 'Each truck loaded at the gantry generates a timestamped record linking product type, volume, distributor, and destination region. Nothing leaves without a record.' },
  { icon: 'chain', title: 'Ledger entries that cannot be changed', description: 'Daily reconciliation records are SHA-256 hash-chained. Once written, alteration is mathematically detectable. Both Dangote and the NMDPRA read from the same record.' },
  { icon: 'building', title: 'A dedicated view for the NMDPRA', description: 'Regulators get a read-only portal showing the same verified data. Export to CSV for any date range. The adversarial dynamic ends when both see the same numbers.' },
  { icon: 'report', title: 'Reports that survive due diligence', description: 'One-click reports covering any date range include a cryptographic ledger verification. This is the operational track record institutional investors ask for before they buy.' },
]

const steps = [
  ['01', 'Data arrives', 'A sensor or API sends readings to RSV ingest endpoints.'],
  ['02', 'Numbers reconcile', 'The engine compares intake, yield, and output against the daily target.'],
  ['03', 'Record is sealed', 'A midnight ledger entry is written with a SHA-256 hash chain.'],
  ['04', 'Both sides verify', 'Management and regulators see the same verified record.'],
]

function FeatureIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    tanker: 'M3 16h18l-2 4H6l-3-4Zm2 0V8h11l3 8M7 8V5h8v3M8 20v1m10-1v1M9 11h2m3 0h2',
    balance: 'M12 3v17m-7 0h14M6 7h12M6 7l-3 5h6L6 7Zm12 0-3 5h6l-3-5ZM9 3h6',
    truck: 'M3 6h12v11H3zM15 10h4l3 3v4h-7zM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    chain: 'M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.2 1.2m3.2 5a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.2-1.2',
    building: 'M4 21h16M6 21V7l6-4 6 4v14M9 10h1m4 0h1M9 14h1m4 0h1M10 21v-4h4v4',
    report: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7m-7 4h4',
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[kind]} /></svg>
}

function LandingPage() {
  const pairedProblems = [...problems, ...problems]
  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <a className="brand-mark" href="#top" aria-label="RSV home">RSV<sup>BETA</sup></a>
        <Link to="/login" className="nav-demo">Request Demo</Link>
      </nav>

      <section className="landing-hero" id="top">
        <div className="hero-copy">
          <div className="hero-status"><LiveDot label="Live system" /></div>
          <h1>The refinery produced<br />18 million litres yesterday.<br />It promised 35.</h1>
          <p>RSV creates a tamper-evident, real-time record of every barrel in and every litre out. When the NMDPRA publishes a number, it matches yours. Because you are both reading the same ledger.</p>
          <div className="hero-actions">
            <Link to="/login" className="button-primary">See the live demo</Link>
            <a href="#what-rsv-does" className="button-secondary">Read the brief</a>
          </div>
        </div>
        <div className="hero-stat-strip">
          {[
            ['650,000 bpd', 'Refinery capacity'],
            ['51.5%', 'Average fulfillment Oct 24 to Oct 25'],
            ['35M litres', 'Daily commitment target'],
            ['0', 'Arbiter disputes with RSV deployed'],
          ].map(([value, label]) => <div className="hero-stat" key={label}><strong>{value}</strong><span>{label}</span></div>)}
        </div>
      </section>

      <section className="landing-features" id="what-rsv-does">
        <div className="landing-section-heading"><span>Built for the operating record</span><h2>What RSV does</h2></div>
        <div className="feature-grid">
          {features.map((feature) => <article className="feature-card" key={feature.title}>
            <div className="feature-icon"><FeatureIcon kind={feature.icon} /></div>
            <h3>{feature.title}</h3><p>{feature.description}</p>
          </article>)}
        </div>
      </section>

      <section className="problems-section">
        <h2>The problems it solves</h2>
        <div className="marquee-window">
          <div className="marquee-track">
            {pairedProblems.map(([problem, solution], index) => <div className="problem-pair" key={`${index}-${problem}`}>
              <article className="problem-card"><span>Problem</span><p>{problem}</p></article>
              <svg className="pair-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-6 6 6-6 6" /></svg>
              <article className="solution-card"><span>RSV</span><p>{solution}</p></article>
            </div>)}
          </div>
        </div>
      </section>

      <section className="how-section">
        <div className="landing-section-heading"><span>One record, from intake to oversight</span><h2>How RSV works</h2></div>
        <div className="steps-grid">
          {steps.map(([number, title, description], index) => <div className="step-wrap" key={number}>
            <article className="process-step"><div className="step-number">{number}</div><h3>{title}</h3><p>{description}</p></article>
            {index < steps.length - 1 && <svg className="step-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-6 6 6-6 6" /></svg>}
          </div>)}
        </div>
      </section>

      <section className="landing-cta" id="request-demo">
        <h2>RSV is running. The refinery is not.</h2>
        <p>One data feed connected in 30 days is all it takes to begin building the operational record the IPO requires.</p>
        <Link to="/login" className="button-primary">Request a demo</Link>
      </section>

      <footer className="landing-footer">
        <div><a className="brand-mark" href="#top">RSV</a><span>Real-Time Refinery Output and Crude Supply Verification</span></div>
        <a href="https://github.com/Mykelsown" target="_blank" rel="noreferrer">Samuel Micheal Pelumi, Lagos Nigeria, github.com/Mykelsown</a>
      </footer>
    </div>
  )
}

export default LandingPage