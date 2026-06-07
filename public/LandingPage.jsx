import React, { useState, useEffect, useRef } from 'react';

// ============================================================================
// CONFIGURATION
// ============================================================================
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const DEMO_MODE_DURATION = 8; // seconds per demo step

// ============================================================================
// DESIGN TOKENS (from frontend/constants/theme.ts)
// ============================================================================
const colors = {
  bg:          '#f5f5f5',
  darkBg:      '#0e0e0e',
  card:        '#ffffff',
  darkCard:    '#1a1a1a',
  darkCardAlt: '#222222',
  ink:         '#111111',
  inkSoft:     '#555555',
  muted:       '#888888',
  mutedLight:  '#aaaaaa',
  white:       '#ffffff',
  black:       '#000000',
  border:      '#e8e8e8',
  darkBorder:  '#2a2a2a',
  lime:        '#C6F135',
  amber:       '#F5A623',
  danger:      '#FF5A5A',
  success:     '#22c55e',
  yellow:      '#f0c040',
};

const spacing = {
  xxs: 2,
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  xxxl: 32,
};

const radii = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  full: 9999,
};

const fontSize = {
  xs:      11,
  sm:      13,
  md:      15,
  lg:      17,
  xl:      20,
  xxl:     24,
  xxxl:    30,
  display: 52,
};

// ============================================================================
// STYLES
// ============================================================================
function injectStyles() {
  if (document.getElementById('anchor-landing-styles')) return;

  const link = document.createElement('link');
  link.href = 'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&family=Sora:wght@400;600;700&display=swap';
  link.rel = 'stylesheet';
  document.head.appendChild(link);

  const style = document.createElement('style');
  style.id = 'anchor-landing-styles';
  style.textContent = `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    :root {
      --bg: ${colors.bg};
      --dark-bg: ${colors.darkBg};
      --card: ${colors.card};
      --dark-card: ${colors.darkCard};
      --dark-card-alt: ${colors.darkCardAlt};
      --ink: ${colors.ink};
      --ink-soft: ${colors.inkSoft};
      --muted: ${colors.muted};
      --muted-light: ${colors.mutedLight};
      --white: ${colors.white};
      --black: ${colors.black};
      --border: ${colors.border};
      --dark-border: ${colors.darkBorder};
      --lime: ${colors.lime};
      --amber: ${colors.amber};
      --danger: ${colors.danger};
      --success: ${colors.success};
      --yellow: ${colors.yellow};
    }

    body {
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--ink);
      line-height: 1.6;
      font-size: ${fontSize.md}px;
    }

    a {
      color: var(--ink);
      text-decoration: none;
    }

    button {
      cursor: pointer;
      border: none;
      font-family: inherit;
      transition: all 0.2s ease;
    }

    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: ${radii.sm}px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--muted);
    }

    /* Typography */
    .text-display {
      font-size: ${fontSize.display}px;
      font-weight: 700;
      letter-spacing: -1.5px;
      font-family: 'Sora', sans-serif;
    }

    .text-xxxl {
      font-size: ${fontSize.xxxl}px;
      font-weight: 700;
      font-family: 'Sora', sans-serif;
    }

    .text-xxl {
      font-size: ${fontSize.xxl}px;
      font-weight: 600;
      font-family: 'Sora', sans-serif;
    }

    .text-xl {
      font-size: ${fontSize.xl}px;
      font-weight: 600;
    }

    .text-lg {
      font-size: ${fontSize.lg}px;
      font-weight: 500;
    }

    .text-md {
      font-size: ${fontSize.md}px;
      font-weight: 500;
    }

    .text-sm {
      font-size: ${fontSize.sm}px;
      font-weight: 500;
    }

    .text-muted {
      color: var(--muted);
    }

    /* Cards */
    .card {
      background: var(--card);
      border-radius: ${radii.lg}px;
      border: 1px solid var(--border);
      padding: ${spacing.xl}px;
      transition: all 0.3s ease;
    }

    .card:hover {
      border-color: var(--muted);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
    }

    .card.dark {
      background: var(--dark-card);
      border-color: var(--dark-border);
      color: var(--white);
    }

    /* Buttons */
    .btn {
      padding: ${spacing.md}px ${spacing.xl}px;
      border-radius: ${radii.md}px;
      font-size: ${fontSize.md}px;
      font-weight: 600;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: ${spacing.sm}px;
    }

    .btn-primary {
      background: var(--ink);
      color: var(--white);
    }

    .btn-primary:hover {
      opacity: 0.9;
      transform: translateY(-2px);
    }

    .btn-secondary {
      background: var(--lime);
      color: var(--ink);
    }

    .btn-secondary:hover {
      opacity: 0.9;
    }

    .btn-outline {
      background: transparent;
      color: var(--ink);
      border: 2px solid var(--border);
    }

    .btn-outline:hover {
      border-color: var(--ink);
      background: var(--bg);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Forms */
    .form-group {
      margin-bottom: ${spacing.lg}px;
    }

    label {
      display: block;
      margin-bottom: ${spacing.sm}px;
      font-size: ${fontSize.sm}px;
      font-weight: 600;
      color: var(--ink);
    }

    input, textarea {
      width: 100%;
      padding: ${spacing.md}px;
      border: 1px solid var(--border);
      border-radius: ${radii.md}px;
      font-family: inherit;
      font-size: ${fontSize.md}px;
      transition: all 0.2s ease;
    }

    input:focus, textarea:focus {
      outline: none;
      border-color: var(--ink);
      box-shadow: 0 0 0 3px rgba(17, 17, 17, 0.1);
    }

    input::placeholder {
      color: var(--muted-light);
    }

    /* Layout */
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 ${spacing.lg}px;
    }

    .grid {
      display: grid;
      gap: ${spacing.xl}px;
    }

    .grid-2 {
      grid-template-columns: 1fr 1fr;
    }

    .grid-3 {
      grid-template-columns: repeat(3, 1fr);
    }

    @media (max-width: 768px) {
      .grid-2, .grid-3 {
        grid-template-columns: 1fr;
      }
      .text-display {
        font-size: ${fontSize.xxxl}px;
      }
    }

    /* Animations */
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes slideInLeft {
      from {
        opacity: 0;
        transform: translateX(-40px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @keyframes slideInRight {
      from {
        opacity: 0;
        transform: translateX(40px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.6;
      }
    }

    .animate-in {
      animation: fadeIn 0.6s ease forwards;
    }

    .delay-1 { animation-delay: 0.1s; }
    .delay-2 { animation-delay: 0.2s; }
    .delay-3 { animation-delay: 0.3s; }

    /* Specific styles */
    nav {
      position: sticky;
      top: 0;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      z-index: 100;
      border-bottom: 1px solid var(--border);
    }

    nav .nav-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: ${spacing.md}px ${spacing.lg}px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-size: ${fontSize.xxl}px;
      font-weight: 700;
      color: var(--ink);
      letter-spacing: -0.5px;
    }

    .nav-links {
      display: flex;
      gap: ${spacing.xl}px;
      list-style: none;
    }

    .nav-links a {
      font-size: ${fontSize.sm}px;
      font-weight: 500;
      transition: color 0.2s;
    }

    .nav-links a:hover {
      color: var(--lime);
    }

    @media (max-width: 768px) {
      .nav-links {
        display: none;
      }
    }

    /* Hero */
    .hero {
      padding: ${spacing.xxxl * 3}px ${spacing.lg}px;
      text-align: center;
    }

    .hero-content h1 {
      margin-bottom: ${spacing.lg}px;
    }

    .hero-content p {
      font-size: ${fontSize.xl}px;
      color: var(--muted);
      margin-bottom: ${spacing.xxl}px;
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
    }

    .hero-buttons {
      display: flex;
      gap: ${spacing.lg}px;
      justify-content: center;
      flex-wrap: wrap;
    }

    /* Feature grid */
    .feature-card {
      padding: ${spacing.xxl}px;
    }

    .feature-icon {
      font-size: 40px;
      margin-bottom: ${spacing.lg}px;
    }

    .feature-card h3 {
      margin-bottom: ${spacing.md}px;
      font-size: ${fontSize.xl}px;
    }

    .feature-card p {
      color: var(--muted);
      font-size: ${fontSize.sm}px;
      line-height: 1.6;
    }

    /* Demo section */
    .demo-container {
      background: var(--dark-card);
      border-radius: ${radii.lg}px;
      padding: ${spacing.xxl}px;
      margin: ${spacing.xxxl}px 0;
      color: var(--white);
    }

    .demo-screen {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: ${spacing.xxl}px;
      align-items: center;
    }

    .demo-mockup {
      background: var(--dark-card-alt);
      border-radius: ${radii.xl}px;
      aspect-ratio: 9 / 16;
      max-width: 300px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 2px solid var(--dark-border);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .demo-mockup-header {
      background: var(--lime);
      color: var(--ink);
      padding: ${spacing.lg}px;
      font-weight: 600;
      font-size: ${fontSize.sm}px;
    }

    .demo-mockup-content {
      flex: 1;
      padding: ${spacing.xl}px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: ${spacing.lg}px;
    }

    .demo-controls {
      display: flex;
      gap: ${spacing.md}px;
      margin-top: ${spacing.xl}px;
    }

    .demo-controls button {
      flex: 1;
    }

    /* Signup section */
    .signup-section {
      background: var(--card);
      border-radius: ${radii.lg}px;
      padding: ${spacing.xxxl}px;
      margin: ${spacing.xxxl}px 0;
      border: 2px solid var(--border);
    }

    .signup-form {
      max-width: 500px;
      margin: 0 auto;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: ${spacing.lg}px;
    }

    @media (max-width: 640px) {
      .form-grid {
        grid-template-columns: 1fr;
      }
    }

    .success-message {
      background: var(--success);
      color: white;
      padding: ${spacing.lg}px;
      border-radius: ${radii.md}px;
      margin-bottom: ${spacing.lg}px;
      font-size: ${fontSize.sm}px;
    }

    .error-message {
      background: var(--danger);
      color: white;
      padding: ${spacing.lg}px;
      border-radius: ${radii.md}px;
      margin-bottom: ${spacing.lg}px;
      font-size: ${fontSize.sm}px;
    }

    .loading {
      opacity: 0.6;
      pointer-events: none;
    }

    /* Section spacing */
    section {
      padding: ${spacing.xxxl * 2}px ${spacing.lg}px;
    }

    /* Footer */
    footer {
      background: var(--ink);
      color: var(--white);
      padding: ${spacing.xxxl}px ${spacing.lg}px;
      text-align: center;
      margin-top: ${spacing.xxxl * 2}px;
    }

    .coming-soon {
      display: inline-block;
      background: var(--amber);
      color: var(--ink);
      padding: ${spacing.xs}px ${spacing.md}px;
      border-radius: ${radii.sm}px;
      font-size: ${fontSize.xs}px;
      font-weight: 700;
      text-transform: uppercase;
      margin-left: ${spacing.sm}px;
    }

    .badge {
      display: inline-block;
      background: var(--lime);
      color: var(--ink);
      padding: ${spacing.xs}px ${spacing.md}px;
      border-radius: ${radii.full}px;
      font-size: ${fontSize.xs}px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: ${spacing.lg}px;
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// COMPONENTS
// ============================================================================

function NavBar() {
  const handleSignUpClick = () => {
    document.getElementById('signup-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav>
      <div className="nav-container">
        <div className="logo">ANCHOR</div>
        <ul className="nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#how-it-works">How It Works</a></li>
          <li><a href="#demo">Demo</a></li>
          <li><a href="#analytics">Analytics</a></li>
        </ul>
        <button className="btn btn-primary" onClick={handleSignUpClick}>
          Get Started
        </button>
      </div>
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="hero">
      <div className="container">
        <h1 className="text-display animate-in">
          Prove Your Focus.<br />
          Learn Your Patterns.
        </h1>
        <p className="animate-in delay-1">
          Anchor combines tamper-proof NFC verification, AI-powered insights, and intelligent app blocking to help you build real focus habits. Not just timers—real accountability.
        </p>
        <div className="hero-buttons animate-in delay-2">
          <button className="btn btn-primary">
            Start Free →
          </button>
          <button className="btn btn-outline">
            Watch Demo
          </button>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: '📍',
      title: 'NFC Verification',
      description: 'Scan physical NFC tags at the end of your session to prove you were actually there. Tamper-proof accountability.',
    },
    {
      icon: '⏱️',
      title: 'Smart Timers',
      description: 'Countdown, Pomodoro, or Stopwatch modes—customizable to your rhythm, not a generic one-size-fits-all.',
    },
    {
      icon: '🎯',
      title: 'Focus Score',
      description: 'Get a 0–100 quality metric per session based on duration, completion, and distractions. Track progress, not just time.',
    },
    {
      icon: '🚫',
      title: 'App Blocking',
      description: 'Automatically block distracting apps (Instagram, TikTok, etc.) at the OS level during your session.',
    },
    {
      icon: '📊',
      title: 'Deep Analytics',
      description: 'Day, week, month views with completion rates, streaks, health scores, and detailed session logs.',
    },
    {
      icon: '✨',
      title: 'AI Insights',
      description: 'Gemini-powered analysis reveals your optimal focus times, distraction patterns, and personalized recommendations.',
    },
  ];

  return (
    <section id="features" style={{ backgroundColor: colors.bg }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: spacing.xxxl * 2 }}>
          <h2 className="text-xxxl">Built for Real Productivity</h2>
          <p className="text-muted" style={{ marginTop: spacing.lg, maxWidth: 600, margin: `${spacing.lg}px auto 0` }}>
            Six core features that actually change how you work.
          </p>
        </div>
        <div className="grid grid-3">
          {features.map((f, i) => (
            <div key={i} className="card feature-card animate-in" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    {
      num: '1',
      title: 'Create a Session',
      desc: 'Choose your focus type (Study, Work, Custom), timer mode, and duration. Set the apps you want blocked.',
    },
    {
      num: '2',
      title: 'Go Deep',
      desc: 'Start your timer. The app blocks your selected distractions and tracks every distraction attempt.',
    },
    {
      num: '3',
      title: 'Verify with NFC',
      desc: 'When done, scan your NFC tag to prove you were really there. No cheating.',
    },
    {
      num: '4',
      title: 'Get Your Score',
      desc: 'Your Focus Score (0–100) is calculated instantly. See how you did: duration, mode, distractions.',
    },
    {
      num: '5',
      title: 'Find Patterns',
      desc: 'Over time, AI reveals when you\'re most productive, what distracts you, and how to optimize.',
    },
  ];

  return (
    <section id="how-it-works" style={{ backgroundColor: colors.bg }}>
      <div className="container">
        <h2 className="text-xxxl" style={{ textAlign: 'center', marginBottom: spacing.xxxl }}>
          How Anchor Works
        </h2>
        <div className="grid" style={{ maxWidth: 800, margin: '0 auto' }}>
          {steps.map((s, i) => (
            <div key={i} className="card animate-in" style={{ animationDelay: `${i * 0.1}s` }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: spacing.lg,
              }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: radii.full,
                  background: colors.lime,
                  color: colors.ink,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: fontSize.lg,
                  flexShrink: 0,
                }}>
                  {s.num}
                </div>
                <div>
                  <h3 style={{ fontSize: fontSize.lg, marginBottom: spacing.sm }}>{s.title}</h3>
                  <p style={{ color: colors.muted, fontSize: fontSize.sm }}>{s.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoSection() {
  const [demoStep, setDemoStep] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const autoPlayRef = useRef(null);

  const demoSteps = [
    {
      title: 'Create Session',
      content: (
        <div>
          <div style={{ marginBottom: spacing.lg }}>
            <strong>Session Type</strong><br />
            <select style={{ width: '100%', padding: spacing.sm, marginTop: spacing.sm, background: 'rgba(198, 241, 53, 0.1)', border: `1px solid ${colors.lime}`, borderRadius: radii.md, color: colors.white }}>
              <option>Study</option>
              <option>Work</option>
              <option>Custom</option>
            </select>
          </div>
          <div style={{ marginBottom: spacing.lg }}>
            <strong>Duration</strong><br />
            <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.sm }}>
              {[25, 45, 60].map(m => (
                <button key={m} style={{ flex: 1, padding: spacing.md, background: m === 45 ? colors.lime : 'rgba(255,255,255,0.1)', color: m === 45 ? colors.ink : colors.white, border: 'none', borderRadius: radii.md, cursor: 'pointer' }}>
                  {m}m
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Block Apps',
      content: (
        <div>
          <div style={{ fontSize: fontSize.sm, marginBottom: spacing.lg }}>
            <strong>Selected Apps to Block</strong>
          </div>
          {['Instagram', 'TikTok', 'Twitter', 'YouTube', 'Reddit'].map((app, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md, padding: spacing.md, background: 'rgba(198, 241, 53, 0.1)', borderRadius: radii.md }}>
              <input type="checkbox" defaultChecked style={{ cursor: 'pointer' }} />
              <span style={{ fontSize: fontSize.sm }}>{app}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: 'Active Session',
      content: (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: colors.lime, marginBottom: spacing.xl }}>
            42:15
          </div>
          <div style={{
            width: 150,
            height: 150,
            borderRadius: '50%',
            border: `8px solid rgba(198, 241, 53, 0.3)`,
            margin: '0 auto',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              width: 140,
              height: 140,
              borderRadius: '50%',
              background: `conic-gradient(${colors.lime} 0deg, ${colors.lime} ${(42/45)*360}deg, rgba(198, 241, 53, 0.2) ${(42/45)*360}deg)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span style={{ color: colors.lime, fontSize: fontSize.xl, fontWeight: 700 }}>70%</span>
            </div>
          </div>
          <div style={{ marginTop: spacing.xl, fontSize: fontSize.sm, color: colors.mutedLight }}>
            🚫 Instagram blocked
          </div>
        </div>
      ),
    },
    {
      title: 'Scan NFC Tag',
      content: (
        <div style={{ textAlign: 'center', padding: spacing.xl }}>
          <div style={{
            width: 100,
            height: 100,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${colors.lime} 0%, rgba(198, 241, 53, 0.2) 100%)`,
            margin: '0 auto ${spacing.xl}px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'pulse 1.5s infinite',
            marginBottom: spacing.xl,
          }}>
            <div style={{ fontSize: 40 }}>📍</div>
          </div>
          <strong>Tap your NFC tag</strong><br />
          <span style={{ fontSize: fontSize.sm, color: colors.mutedLight, marginTop: spacing.md, display: 'block' }}>
            Verifying physical presence...
          </span>
        </div>
      ),
    },
    {
      title: 'Your Focus Score',
      content: (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: colors.lime, marginBottom: spacing.lg }}>
            85
            <span style={{ fontSize: fontSize.xl, color: colors.mutedLight }}>/100</span>
          </div>
          <div style={{ background: 'rgba(198, 241, 53, 0.2)', height: 8, borderRadius: radii.full, marginBottom: spacing.xl, overflow: 'hidden' }}>
            <div style={{ background: colors.lime, height: '100%', width: '85%', borderRadius: radii.full }} />
          </div>
          <div style={{ fontSize: fontSize.xs, color: colors.mutedLight, textAlign: 'left', marginTop: spacing.lg }}>
            <div>✓ 45 min session</div>
            <div>✓ No distractions</div>
            <div>✓ NFC verified</div>
          </div>
        </div>
      ),
    },
  ];

  useEffect(() => {
    if (!isAutoPlay) return;
    autoPlayRef.current = setTimeout(() => {
      setDemoStep((prev) => (prev + 1) % demoSteps.length);
    }, DEMO_MODE_DURATION * 1000);
    return () => clearTimeout(autoPlayRef.current);
  }, [isAutoPlay, demoStep, demoSteps.length]);

  const handleNextStep = () => {
    setDemoStep((prev) => (prev + 1) % demoSteps.length);
    setIsAutoPlay(false);
  };

  const handlePrevStep = () => {
    setDemoStep((prev) => (prev - 1 + demoSteps.length) % demoSteps.length);
    setIsAutoPlay(false);
  };

  return (
    <section id="demo">
      <div className="container">
        <h2 className="text-xxxl" style={{ textAlign: 'center', marginBottom: spacing.xxxl }}>
          See It in Action
        </h2>
        <div className="demo-container">
          <div className="demo-screen" style={{ gridTemplateColumns: window.innerWidth > 768 ? '1fr 1fr' : '1fr' }}>
            <div>
              <h3 className="text-xxl" style={{ marginBottom: spacing.lg }}>
                {demoSteps[demoStep].title}
              </h3>
              <p style={{ color: colors.mutedLight, marginBottom: spacing.xl }}>
                Step {demoStep + 1} of {demoSteps.length}
              </p>
              <div style={{
                background: 'rgba(0, 0, 0, 0.3)',
                padding: spacing.xl,
                borderRadius: radii.lg,
                minHeight: 300,
              }}>
                {demoSteps[demoStep].content}
              </div>
              <div className="demo-controls">
                <button className="btn btn-outline" style={{ borderColor: colors.mutedLight, color: colors.white }} onClick={handlePrevStep}>
                  ← Back
                </button>
                <button className="btn btn-secondary" onClick={handleNextStep}>
                  Next →
                </button>
              </div>
            </div>
            <div style={{ display: window.innerWidth > 768 ? 'flex' : 'none', justifyContent: 'center', alignItems: 'center' }}>
              <div className="demo-mockup">
                <div className="demo-mockup-header">
                  Step {demoStep + 1} • {demoSteps[demoStep].title}
                </div>
                <div className="demo-mockup-content">
                  {demoSteps[demoStep].content}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AnalyticsPreviewSection() {
  return (
    <section id="analytics" style={{ backgroundColor: colors.bg }}>
      <div className="container">
        <h2 className="text-xxxl" style={{ textAlign: 'center', marginBottom: spacing.xxxl }}>
          Your Insights, Your Way
        </h2>
        <div className="grid grid-2">
          <div className="card animate-in">
            <h3 className="text-xl" style={{ marginBottom: spacing.lg }}>
              📊 Weekly Analytics
            </h3>
            <p style={{ color: colors.muted, marginBottom: spacing.xl, fontSize: fontSize.sm }}>
              Track completion rates, total focus hours, streaks, and health scores across any time period.
            </p>
            <div style={{
              background: colors.bg,
              padding: spacing.lg,
              borderRadius: radii.md,
              marginBottom: spacing.lg,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: spacing.lg, fontSize: fontSize.sm, fontWeight: 600 }}>
                <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span>
              </div>
              {[60, 75, 45, 90, 80].map((h, i) => (
                <div key={i} style={{
                  height: (h / 100) * 80 + 'px',
                  background: colors.lime,
                  borderRadius: radii.sm,
                  marginBottom: spacing.sm,
                }} />
              ))}
            </div>
            <div style={{ fontSize: fontSize.sm, color: colors.muted }}>
              <strong>Total:</strong> 350 minutes • <strong>Avg Score:</strong> 78/100
            </div>
          </div>

          <div className="card animate-in delay-1">
            <h3 className="text-xl" style={{ marginBottom: spacing.lg }}>
              ✨ AI-Powered Insights <span className="coming-soon">Beta</span>
            </h3>
            <p style={{ color: colors.muted, marginBottom: spacing.xl, fontSize: fontSize.sm }}>
              Gemini analyzes your patterns to find your optimal focus hours and predict distraction risk.
            </p>
            <div style={{
              background: colors.darkCard,
              color: colors.white,
              padding: spacing.lg,
              borderRadius: radii.md,
              marginBottom: spacing.lg,
              fontSize: fontSize.sm,
            }}>
              <div style={{ marginBottom: spacing.lg }}>
                <strong>🏆 Best Time to Focus</strong><br />
                Tuesday 2–4 PM (92% success rate)
              </div>
              <div style={{ marginBottom: spacing.lg }}>
                <strong>⚠️ Distraction Risk</strong><br />
                High between 3–5 PM (Instagram, Discord)
              </div>
              <div>
                <strong>💡 Suggestion</strong><br />
                Schedule deep work Tue–Wed mornings
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SignUpSection() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (!formData.name.trim() || !formData.email.trim() || !formData.password.trim()) {
        setError('All fields are required');
        setLoading(false);
        return;
      }

      if (formData.password.length < 8) {
        setError('Password must be at least 8 characters');
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Registration failed');
      } else {
        setSuccess('Account created! Check your email or open the app to log in.');
        setFormData({ name: '', email: '', password: '' });
        setTimeout(() => setSuccess(''), 5000);
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="signup-section" style={{ backgroundColor: colors.bg }}>
      <div className="container">
        <div className="signup-section animate-in">
          <h2 className="text-xxxl" style={{ textAlign: 'center', marginBottom: spacing.lg }}>
            Start Your Focus Journey
          </h2>
          <p style={{ textAlign: 'center', color: colors.muted, marginBottom: spacing.xxxl, fontSize: fontSize.lg }}>
            Free forever. No credit card required.
          </p>

          <form className="signup-form" onSubmit={handleSubmit}>
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="name">Full Name</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Alex Chen"
                  value={formData.name}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Password (min 8 characters)</label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className={`btn btn-primary ${loading ? 'loading' : ''}`}
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Create Free Account →'}
            </button>

            <p style={{ textAlign: 'center', marginTop: spacing.lg, fontSize: fontSize.sm, color: colors.muted }}>
              Already have an account? <a href="#login" style={{ color: colors.ink, fontWeight: 600 }}>Log in</a>
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}

function FooterSection() {
  return (
    <footer>
      <div className="container" style={{ maxWidth: 1200 }}>
        <div style={{ marginBottom: spacing.xxxl }}>
          <p style={{ fontSize: fontSize.xxl, fontWeight: 700, marginBottom: spacing.lg }}>⚓ Anchor</p>
          <p style={{ color: colors.mutedLight, marginBottom: spacing.xl }}>
            Prove your focus. Learn your patterns. Optimize your day.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: spacing.xxl, marginBottom: spacing.xxxl, textAlign: 'left' }}>
          <div>
            <h4 style={{ marginBottom: spacing.lg, fontWeight: 600 }}>Product</h4>
            <ul style={{ listStyle: 'none' }}>
              <li style={{ marginBottom: spacing.sm }}><a href="#features" style={{ color: colors.white, opacity: 0.8 }}>Features</a></li>
              <li style={{ marginBottom: spacing.sm }}><a href="#demo" style={{ color: colors.white, opacity: 0.8 }}>Demo</a></li>
              <li><a href="#" style={{ color: colors.white, opacity: 0.8 }}>Pricing</a></li>
            </ul>
          </div>
          <div>
            <h4 style={{ marginBottom: spacing.lg, fontWeight: 600 }}>Resources</h4>
            <ul style={{ listStyle: 'none' }}>
              <li style={{ marginBottom: spacing.sm }}><a href="#" style={{ color: colors.white, opacity: 0.8 }}>Blog</a></li>
              <li style={{ marginBottom: spacing.sm }}><a href="#" style={{ color: colors.white, opacity: 0.8 }}>Guides</a></li>
              <li><a href="#" style={{ color: colors.white, opacity: 0.8 }}>Status</a></li>
            </ul>
          </div>
          <div>
            <h4 style={{ marginBottom: spacing.lg, fontWeight: 600 }}>Company</h4>
            <ul style={{ listStyle: 'none' }}>
              <li style={{ marginBottom: spacing.sm }}><a href="#" style={{ color: colors.white, opacity: 0.8 }}>About</a></li>
              <li style={{ marginBottom: spacing.sm }}><a href="#" style={{ color: colors.white, opacity: 0.8 }}>Privacy</a></li>
              <li><a href="#" style={{ color: colors.white, opacity: 0.8 }}>Terms</a></li>
            </ul>
          </div>
        </div>

        <div style={{
          borderTop: `1px solid ${colors.darkBorder}`,
          paddingTop: spacing.xl,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: spacing.lg,
        }}>
          <p style={{ color: colors.mutedLight, fontSize: fontSize.sm }}>
            © 2024 Anchor. All rights reserved.
          </p>
          <div style={{ display: 'flex', gap: spacing.lg }}>
            <a href="#" style={{ color: colors.white, opacity: 0.6 }}>Twitter</a>
            <a href="#" style={{ color: colors.white, opacity: 0.6 }}>GitHub</a>
            <a href="#" style={{ color: colors.white, opacity: 0.6 }}>Discord</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================

export default function LandingPage() {
  useEffect(() => {
    injectStyles();
  }, []);

  return (
    <>
      <NavBar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <DemoSection />
      <AnalyticsPreviewSection />
      <SignUpSection />
      <FooterSection />
    </>
  );
}
