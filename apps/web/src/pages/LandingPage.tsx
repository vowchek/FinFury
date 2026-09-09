import { Link } from 'react-router-dom';

/**
 * Лендинг FinFury — «Киберпанк-приборная панель».
 * Узкая колонка (~960px), индиго-фон, неон + циан, HUD-рамки, моноширинные цифры.
 */

const NAV_LINKS = [
  { href: '#features', label: 'Возможности' },
  { href: '#how', label: 'Как это работает' },
  { href: '#assets', label: 'Активы' },
];

const FEATURES = [
  {
    title: 'Единая книга транзакций',
    text: 'Каждая позиция выводится из сделок. Никаких ручных пересчётов и расхождений между таблицами.',
  },
  {
    title: 'Доходы считаются сами',
    text: 'Дивиденды и купоны учитываются как доход — с налогами, реинвестированием и историей.',
  },
  {
    title: 'Оценка стоимости',
    text: 'Цены активов обновляются автоматически из внешних источников. Портфель всегда актуален.',
  },
  {
    title: 'Расходы рядом с портфелем',
    text: 'Траты и категории в одном месте с инвестициями — вся финансовая картина целиком.',
  },
];

const STEPS = [
  {
    title: 'Введите портфель',
    text: 'Начните с текущих позиций и cost basis или с полного журнала сделок — как удобнее.',
  },
  {
    title: 'FinFury ведёт книгу',
    text: 'Транзакции превращаются в позиции, доходы и стоимость. Всё считается из одного источника.',
  },
  {
    title: 'Смотрите картину',
    text: 'Дашборд, графики доходности, дивиденды и расходы — без таблиц вручную.',
  },
];

const ASSETS = [
  { name: 'Акции', detail: 'позиции и cost basis' },
  { name: 'Облигации', detail: 'купоны и погашения' },
  { name: 'Крипто', detail: 'кошельки и сделки' },
  { name: 'Кэш', detail: 'остатки и расходы' },
];

const ALLOCATION = [
  { label: 'Акции', value: 46, color: 'bg-neon' },
  { label: 'Облигации', value: 28, color: 'bg-cyber' },
  { label: 'Крипто', value: 18, color: 'bg-amber' },
  { label: 'Кэш', value: 8, color: 'bg-panel' },
];

function Logo() {
  return (
    <span className="font-display text-xl tracking-wide text-ghost">
      Fin<span className="text-neon">Fury</span>
    </span>
  );
}

/** HUD-рамка с неоновыми уголками. */
function Hud({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`hud ${className}`}>
      <span className="hud-corner tl" aria-hidden="true" />
      <span className="hud-corner tr" aria-hidden="true" />
      <span className="hud-corner bl" aria-hidden="true" />
      <span className="hud-corner br" aria-hidden="true" />
      {children}
    </div>
  );
}

/** Моноширинная HUD-метка вида `// system.tag`. */
function HudTag({ children }: { children: string }) {
  return (
    <p className="font-mono text-xs tracking-tight text-cyber/80">
      <span className="text-mute">//</span> {children}
    </p>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-10 border-b border-edge/70 bg-night/90 backdrop-blur">
      <nav className="mx-auto flex max-w-page items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2" aria-label="FinFury — на главную">
          <Logo />
        </Link>
        <ul className="hidden items-center gap-7 text-sm text-ghost/80 md:flex">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="transition-colors hover:text-ghost">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <Link
          to="/login"
          className="rounded border border-neon/60 px-5 py-2 text-sm font-medium text-ghost transition-colors hover:border-neon hover:bg-neon/10"
        >
          Войти
        </Link>
      </nav>
    </header>
  );
}

function Sparkline() {
  // Мини-график стоимости портфеля за год.
  const points = [42, 46, 44, 52, 58, 55, 63, 70, 66, 74, 82, 88];
  const w = 320;
  const h = 96;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = h - ((p - min) / (max - min)) * (h - 16) - 8;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M ${coords.join(' L ')}`;
  const area = `${path} L ${w},${h} L 0,${h} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-24 w-full"
      role="img"
      aria-label="График роста стоимости портфеля за год"
    >
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2FE0FF" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2FE0FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <path
        d={path}
        fill="none"
        stroke="#2FE0FF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={w} cy={coords[coords.length - 1].split(',')[1]} r="4" fill="#2FE0FF" />
    </svg>
  );
}

function PortfolioPanel() {
  return (
    <Hud className="rounded-lg border border-edge bg-panel p-6 shadow-[0_0_24px_rgba(255,46,136,0.15)]">
      <HudTag>portfolio.status</HudTag>
      <div className="mt-4 flex items-baseline justify-between">
        <p className="text-sm text-mute">Портфель сегодня</p>
        <span className="inline-flex items-center gap-1 font-mono text-sm text-amber">
          <span aria-hidden="true">▲</span> +3,2% / мес
        </span>
      </div>
      <p className="glitch mt-3 font-mono text-4xl font-medium tracking-tight text-ghost">
        1 284 500 <span className="text-2xl">₽</span>
      </p>

      <div className="mt-6">
        <p className="font-mono text-xs text-mute">allocation</p>
        <div className="mt-2 flex h-3 overflow-hidden rounded-sm">
          {ALLOCATION.map((a) => (
            <span key={a.label} className={a.color} style={{ width: `${a.value}%` }} />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ghost/70">
          {ALLOCATION.map((a) => (
            <li key={a.label} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${a.color}`} aria-hidden="true" />
              {a.label} {a.value}%
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <p className="font-mono text-xs text-mute">value.12m</p>
        <div className="mt-2">
          <Sparkline />
        </div>
      </div>
    </Hud>
  );
}

function Hero() {
  return (
    <section className="cyber-grid mx-auto max-w-page px-6 pt-16 pb-20">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <HudTag>finfury.portfolio</HudTag>
          <h1 className="mt-5 font-display text-5xl leading-tight tracking-tight text-ghost sm:text-6xl">
            Ваши инвестиции — на одном экране
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ghost/80">
            FinFury ведёт единую книгу транзакций: акции, облигации, крипто и расходы.
            Стоимость портфеля, дивиденды и доходность считаются сами.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to="/login"
              className="rounded bg-neon px-7 py-3 text-base font-semibold text-night transition-colors hover:bg-neon/90"
            >
              Начать бесплатно
            </Link>
            <a
              href="#how"
              className="rounded border border-edge px-7 py-3 text-base font-medium text-ghost transition-colors hover:border-cyber/60"
            >
              Как это работает
            </a>
          </div>
        </div>
        <PortfolioPanel />
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="mx-auto max-w-page px-6 py-20">
      <HudTag>capabilities</HudTag>
      <h2 className="mt-4 font-display text-3xl tracking-tight text-ghost">
        Всё, что нужно для спокойного учёта
      </h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <article key={f.title} className="rounded-lg border border-edge bg-panel p-6">
            <h3 className="font-display text-lg text-ghost">{f.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-ghost/75">{f.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-page px-6 py-20">
      <HudTag>sequence</HudTag>
      <h2 className="mt-4 font-display text-3xl tracking-tight text-ghost">
        Как это работает
      </h2>
      <ol className="mt-10 grid gap-6 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-lg border border-edge bg-panel p-6">
            <span className="font-mono text-2xl text-neon">0{i + 1}</span>
            <h3 className="mt-3 font-display text-lg text-ghost">{s.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-ghost/75">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Assets() {
  return (
    <section id="assets" className="mx-auto max-w-page px-6 py-20">
      <HudTag>asset.classes</HudTag>
      <h2 className="mt-4 font-display text-3xl tracking-tight text-ghost">
        Любые активы — одна книга
      </h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {ASSETS.map((a) => (
          <div key={a.name} className="rounded-lg border border-edge bg-panel p-6">
            <h3 className="font-display text-xl text-ghost">{a.name}</h3>
            <p className="mt-2 text-sm text-ghost/70">{a.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-page px-6 py-24">
      <Hud className="rounded-lg border border-edge bg-panel px-8 py-14 text-center shadow-[0_0_24px_rgba(47,224,255,0.12)]">
        <HudTag>finfury.init</HudTag>
        <h2 className="mt-5 font-display text-4xl tracking-tight text-ghost">
          Начните вести портфель спокойно
        </h2>
        <p className="mt-4 text-lg text-ghost/80">
          Бесплатно, без карты. Введите первый портфель за несколько минут.
        </p>
        <Link
          to="/login"
          className="mt-8 inline-block rounded bg-neon px-8 py-3 text-base font-semibold text-night transition-colors hover:bg-neon/90"
        >
          Начать бесплатно
        </Link>
      </Hud>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-edge/70">
      <div className="mx-auto flex max-w-page flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Logo />
        </div>
        <p className="text-sm text-mute">Личные финансы без лишнего шума.</p>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-night font-sans text-ghost antialiased">
      <div className="scanlines" aria-hidden="true" />
      <Nav />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Assets />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}