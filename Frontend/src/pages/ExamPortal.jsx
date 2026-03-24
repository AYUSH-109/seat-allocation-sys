import { useState, useEffect } from "react";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');

  :root {
    --orange:      #F05A1A;
    --orange-dark: #C0430E;
    --orange-pale: #FDE8DC;
    --cream:       #FFF8F4;
    --ink:         #1A0F0A;
    --ink-mid:     #5C3A28;
    --ink-light:   #9C6B50;
    --shadow:      rgba(240,90,26,.18);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .portal-root {
    font-family: 'DM Sans', sans-serif;
    background: var(--cream);
    color: var(--ink);
    min-height: 100vh;
    overflow-x: hidden;
    position: relative;
  }

  /* grain */
  .portal-root::before {
    content: '';
    position: fixed; inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 999;
    opacity: .45;
  }

  /* ── HEADER ── */
  .portal-header {
    background: var(--orange);
    padding: 0 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 70px;
    position: relative;
    overflow: hidden;
  }
  .portal-header::after {
    content: '';
    position: absolute;
    right: -60px; top: -60px;
    width: 220px; height: 220px;
    border-radius: 50%;
    background: rgba(255,255,255,.07);
    pointer-events: none;
  }

  .logo { display: flex; align-items: center; gap: 12px; cursor: pointer; }
  .logo-box {
    width: 36px; height: 36px;
    background: #fff;
    border-radius: 8px;
    display: grid; place-items: center;
  }
  .logo-name {
    font-family: 'Space Mono', monospace;
    font-weight: 700;
    font-size: 0.95rem;
    color: #fff;
    letter-spacing: .05em;
  }
  .logo-name span { opacity: .6; font-weight: 400; }

  .portal-nav { display: flex; gap: 6px; }
  .nav-link {
    color: rgba(255,255,255,.8);
    font-size: .83rem;
    padding: 6px 14px;
    border-radius: 20px;
    border: none; background: transparent;
    cursor: pointer;
    transition: background .2s, color .2s;
    font-family: 'DM Sans', sans-serif;
  }
  .nav-link:hover { background: rgba(255,255,255,.15); color: #fff; }

  /* ── HERO ── */
  .portal-hero {
    position: relative;
    padding: 72px 48px 52px;
    overflow: hidden;
  }
  .portal-hero::before {
    content: '';
    position: absolute;
    right: -100px; top: -100px;
    width: 460px; height: 460px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(240,90,26,.11) 0%, transparent 70%);
    pointer-events: none;
  }
  .portal-hero::after {
    content: '';
    position: absolute;
    left: 32%; bottom: -80px;
    width: 240px; height: 240px;
    border-radius: 50%;
    border: 2px solid rgba(240,90,26,.12);
    pointer-events: none;
  }

  .eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--orange-pale);
    border: 1px solid rgba(240,90,26,.25);
    color: var(--orange-dark);
    font-family: 'Space Mono', monospace;
    font-size: .7rem; font-weight: 700;
    letter-spacing: .1em; text-transform: uppercase;
    padding: 4px 10px; border-radius: 4px;
    margin-bottom: 22px;
  }
  .eyebrow-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--orange);
    animation: pulse 2s ease infinite;
  }

  .hero-title {
    font-family: 'Space Mono', monospace;
    font-size: clamp(2rem, 6vw, 3.5rem);
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: 0;
    color: var(--ink);
    max-width: 660px;
  }
  .hero-title .accent { color: var(--orange); }

  .hero-sub {
    margin-top: 18px;
    font-size: 1rem;
    color: var(--ink-mid);
    max-width: 500px;
    line-height: 1.7;
    font-weight: 300;
  }

  .hero-divider {
    width: 60px; height: 3px;
    background: var(--orange);
    border-radius: 2px;
    margin-top: 32px;
  }

  /* ── SECTION LABEL ── */
  .section-label {
    padding: 0 48px;
    font-size: .7rem;
    font-weight: 500;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--ink-mid);
    margin-bottom: 18px;
  }

  /* ── CARDS ── */
  .cards-grid {
    padding: 0 48px 72px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 22px;
  }

  @media (max-width: 900px) {
    .cards-grid { grid-template-columns: 1fr; }
    .portal-header, .portal-hero, .section-label, .cards-grid, .portal-footer {
      padding-left: 22px; padding-right: 22px;
    }
  }

  .card {
    background: #fff;
    border: 1.5px solid rgba(240,90,26,.1);
    border-radius: 20px;
    padding: 34px 30px 28px;
    display: flex; flex-direction: column;
    position: relative; overflow: hidden;
    cursor: pointer;
    transition: transform .28s cubic-bezier(.34,1.56,.64,1),
                box-shadow .28s ease,
                border-color .28s ease;
    text-decoration: none; color: inherit;
  }
  .card:hover {
    transform: translateY(-7px);
    box-shadow: 0 24px 52px var(--shadow);
    border-color: var(--orange);
  }
  .card::before {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(circle at 50% 0%, rgba(240,90,26,.055) 0%, transparent 65%);
    opacity: 0; transition: opacity .3s;
    border-radius: inherit; pointer-events: none;
  }
  .card:hover::before { opacity: 1; }

  .card-bar {
    position: absolute;
    top: 0; left: 30px; right: 30px;
    height: 3px;
    border-radius: 0 0 4px 4px;
    background: var(--orange);
    transform: scaleX(0);
    transform-origin: left;
    transition: transform .32s ease;
  }
  .card:hover .card-bar { transform: scaleX(1); }

  .card-num {
    position: absolute;
    right: 22px; top: 14px;
    font-family: 'Space Mono', monospace;
    font-size: 3.5rem; font-weight: 700;
    color: rgba(240,90,26,.055);
    line-height: 1;
    user-select: none; pointer-events: none;
    transition: color .25s;
  }
  .card:hover .card-num { color: rgba(240,90,26,.1); }

  .icon-wrap {
    width: 54px; height: 54px;
    border-radius: 13px;
    background: var(--orange-pale);
    display: grid; place-items: center;
    margin-bottom: 22px;
    transition: background .25s;
    flex-shrink: 0;
  }
  .card:hover .icon-wrap { background: var(--orange); }
  .icon-wrap svg { width: 25px; height: 25px; transition: stroke .25s; }
  .card:hover .icon-wrap svg { stroke: #fff !important; }

  .card-role {
    font-family: 'Space Mono', monospace;
    font-size: .65rem; font-weight: 700;
    letter-spacing: .12em; text-transform: uppercase;
    color: var(--orange); margin-bottom: 7px;
  }

  .card-title {
    font-family: 'Space Mono', monospace;
    font-size: 1.1rem; font-weight: 700;
    letter-spacing: 0;
    color: var(--ink); margin-bottom: 11px;
  }

  .card-desc {
    font-size: .875rem; color: var(--ink-mid);
    line-height: 1.65; font-weight: 300; flex: 1;
  }

  .card-footer {
    margin-top: 26px;
    display: flex; align-items: center;
    justify-content: space-between; gap: 12px;
  }

  .tags { display: flex; flex-wrap: wrap; gap: 5px; }
  .tag {
    font-size: .68rem; font-weight: 500;
    padding: 3px 10px; border-radius: 20px;
    background: var(--orange-pale);
    color: var(--orange-dark);
    border: 1px solid rgba(240,90,26,.15);
  }

  .arrow-btn {
    width: 35px; height: 35px; flex-shrink: 0;
    border-radius: 50%;
    border: 1.5px solid rgba(240,90,26,.25);
    display: grid; place-items: center;
    transition: background .25s, border-color .25s, transform .25s;
    background: transparent;
  }
  .card:hover .arrow-btn {
    background: var(--orange);
    border-color: var(--orange);
    transform: rotate(45deg);
  }
  .arrow-btn svg { width: 14px; height: 14px; transition: stroke .25s; }
  .card:hover .arrow-btn svg { stroke: #fff !important; }

  /* ── FOOTER ── */
  .portal-footer {
    border-top: 1px solid rgba(240,90,26,.1);
    padding: 22px 48px;
    display: flex; align-items: center;
    justify-content: space-between;
    font-size: .78rem; color: var(--ink-light);
  }
  .portal-footer .highlight { font-weight: 500; color: var(--orange); }

  /* ── FADE-UP ANIMATION ── */
  .fade-up {
    opacity: 0;
    transform: translateY(22px);
    transition: opacity .55s ease, transform .55s ease;
  }
  .fade-up.visible { opacity: 1; transform: translateY(0); }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: .5; transform: scale(.75); }
  }
`;

// ── SVG Icons ──
const GridIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#F05A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <path d="M14 17.5h7M17.5 14v7"/>
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#F05A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7"/>
    <path d="M21 21l-4.35-4.35"/>
    <path d="M11 8v3l2 2"/>
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#F05A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4"/>
    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
  </svg>
);

const LogoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#F05A1A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}>
    <rect x="3" y="3" width="7" height="7" rx="1.5"/>
    <rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/>
    <rect x="14" y="14" width="7" height="7" rx="1.5"/>
  </svg>
);

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#F05A1A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 17L17 7M7 7h10v10"/>
  </svg>
);

// ── Card data ──
const MODULES = [
  {
    num: "01",
    role: "Exam Cell",
    title: "Seat Allocator",
    desc: "Input student data and classroom layouts to auto-generate and export complete seating arrangements for any examination.",
    tags: ["Bulk Import", "PDF Export", "Room Layout"],
    icon: <GridIcon />,
    href: "/landing",   // ← Points to LandingPage (Seat Allocation App)
  },
  {
    num: "02",
    role: "Student",
    title: "Seat Locator",
    desc: "Enter your roll number to instantly find your assigned seat, room, and floor — no confusion on exam day.",
    tags: ["Roll No. Search", "Room & Seat"],
    icon: <SearchIcon />,
    href: "http://localhost:5000",     // ← update to your route
    external: true,
  },
  {
    num: "03",
    role: "Invigilator",
    title: "Exam Ops",
    desc: "Log attendance, report absentees, and submit general exam observations directly from the examination hall.",
    tags: ["Attendance", "Reports", "Live Status"],
    icon: <CheckIcon />,
    href: "http://localhost:5001",         // ← update to your route
    external: true,
  },
];

// ── Card component ──
function ModuleCard({ module, index, navigate }) {
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Fetch exam portal data on component mount
    const fetchExamPortalData = async () => {
      try {
        setLoading(true);
        // This would typically fetch from an API endpoint
        // For now, we'll show a placeholder
        setExamData({
          examName: 'Loading Exam Details...',
          status: 'ready',
          seats: []
        });
      } catch (err) {
        setError('Failed to load exam portal data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchExamPortalData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-indigo-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 text-lg">Loading exam portal...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-red-50 to-pink-50">
        <div className="text-center bg-white rounded-lg shadow-lg p-8">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router('/')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition"
          >
            Go Back Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Exam Portal</h1>
              <p className="text-gray-600 mt-1">Find your seat assignment and exam details</p>
            </div>
            <div className="text-right">
              <div className="flex items-center text-green-600">
                <CheckCircle className="w-5 h-5 mr-2" />
                <span className="font-medium">System Ready</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Welcome Card */}
          <div className="md:col-span-2 bg-white rounded-lg shadow-md p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome to the Exam Portal</h2>
            <p className="text-gray-600 mb-6">
              This portal allows you to access your exam details and seating assignments. 
              Use the navigation options to:
            </p>
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-start">
                <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm">✓</span>
                <span>Find your assigned seat for the exam</span>
              </li>
              <li className="flex items-start">
                <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm">✓</span>
                <span>Download seating plan and exam details</span>
              </li>
              <li className="flex items-start">
                <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm">✓</span>
                <span>Submit feedback or report issues</span>
              </li>
            </ul>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-white rounded-lg shadow-md p-8">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <button
                onClick={() => router('/dashboard')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                View Dashboard
              </button>
              <button
                onClick={() => router('/profile')}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium py-2 px-4 rounded-lg transition"
              >
                My Profile
              </button>
              <button
                onClick={() => router('/feedback')}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                Send Feedback
              </button>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-bold text-blue-900 mb-2">ℹ️ Need Help?</h3>
          <p className="text-blue-800">
            If you have questions about your exam or seat assignment, please contact the exam coordinator
            or submit feedback through the portal.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ExamPortal;
