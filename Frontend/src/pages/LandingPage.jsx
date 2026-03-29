import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Upload, Layout, MapPin, Download, 
    ArrowRight, Sparkles, MousePointer2,
    ChevronRight, Layers, Cpu,
    Star, Command
} from 'lucide-react';

// --- Background Component ---
const BackgroundBranding = () => {
    return (
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-5%] right-[-5%] w-[70%] h-[70%] rounded-full bg-orange-500/5 dark:bg-orange-500/10 blur-[100px]" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-amber-500/5 dark:bg-amber-600/10 blur-[90px]" />
            <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#252525_1px,transparent_1px)] [background-size:32px_32px] opacity-25"></div>
        </div>
    );
};

// --- Premium Button Component ---
const PremiumButton = ({ children, onClick, className, variant = 'primary' }) => {
    const variants = {
        primary: "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-orange-500/25",
        secondary: "bg-white/80 dark:bg-white/5 text-gray-900 dark:text-white border border-gray-200 dark:border-white/10"
    };

    return (
        <button
            type="button"
            onClick={onClick}
            className={`relative px-10 py-5 rounded-2xl text-lg font-black shadow-xl flex items-center justify-center gap-3 transition-colors ${variants[variant]} ${className}`}
        >
            <span className="relative z-10 flex items-center gap-3">{children}</span>
            {variant === 'primary' && (
                <div className="absolute inset-0 rounded-2xl bg-white/20 opacity-0 hover:opacity-100 transition-opacity blur-xl" />
            )}
        </button>
    );
};

// --- Extracted Feature Card Component ---
const FeatureCard = ({ feature }) => {
    return (
        <div className="group relative p-1 leading-none rounded-[3rem] overflow-hidden bg-gradient-to-br from-white/20 to-transparent dark:from-white/10">
            <div className="relative p-8 h-full bg-white/40 dark:bg-[#0a0a0a]/60 backdrop-blur-3xl border border-white/40 dark:border-white/5 rounded-[2.9rem] flex flex-col space-y-6">
                <div className={`relative bg-gradient-to-br ${feature.color} w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl group-hover:scale-125 group-hover:rotate-12 transition-all duration-500`}>
                    <feature.icon className="text-white" size={32} />
                    <div className="absolute inset-0 bg-white/40 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="space-y-3">
                    <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-[0.9]">
                        {feature.title}
                    </h3>
                    <p className="text-gray-700 dark:text-gray-300 font-bold text-sm leading-relaxed">
                        {feature.description}
                    </p>
                </div>
            </div>
            {/* Gloss overlay */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
    );
};

// --- Extracted Workflow Step Component ---
const WorkflowStep = ({ step, idx }) => {
    return (
        <div className="relative flex flex-col items-center group">
            {idx < 2 && (
                <div className="hidden md:block absolute top-[2rem] left-[65%] w-full h-px bg-gradient-to-r from-orange-500 to-transparent z-0" />
            )}
            <div className="relative z-10 mb-8">
                <div className="w-16 h-16 rounded-2xl bg-[#111] dark:bg-white/10 border border-white/20 flex items-center justify-center text-orange-500 font-black text-xl shadow-[0_0_30px_rgba(249,115,22,0.3)] group-hover:scale-125 group-hover:bg-orange-500 group-hover:text-white transition-all duration-500">
                    {step.num}
                </div>
            </div>
            <div className="space-y-4">
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">{step.title}</h3>
                <p className="text-gray-300 font-bold leading-relaxed max-w-[220px] mx-auto text-sm">
                    {step.desc}
                </p>
            </div>
        </div>
    );
};

const LandingPage = () => {
    const navigate = useNavigate();
    const gridCells = useMemo(() => Array.from({ length: 100 }, (_, i) => i), []);

    const features = [
        { icon: Upload, title: 'Neural Ingestion', description: 'Self-correcting data parser with 99.9% accuracy on legacy CSV formats.', color: 'from-orange-500 to-amber-500' },
        { icon: Layout, title: 'Spatial Engine', description: 'Advanced room sculpting with multi-pivot grid systems and custom corridors.', color: 'from-amber-500 to-orange-600' },
        { icon: MapPin, title: 'Solver Core', description: 'Proprietary CSP algorithm handling 15,000+ constraints in under 400ms.', color: 'from-orange-600 to-red-500' },
        { icon: Download, title: 'Vector Exports', description: 'Ultra-thin vector PDFs designed for fast bulk printing and low-latency cloud sync.', color: 'from-amber-500 to-orange-500' }
    ];

    const benefits = ['Lossless Integrity', 'Instant Feedback', 'Bias Removal', 'Zero Latency'];

    return (
        <div className="relative min-h-screen bg-[#f7f7f7] dark:bg-[#050505] selection:bg-orange-500 selection:text-white transition-colors duration-500 font-sans overflow-x-hidden">
            <BackgroundBranding />

            <div className="relative z-10 max-w-7xl mx-auto px-6 space-y-40">
                
                {/* Hero Section */}
                <header className="relative min-h-screen flex flex-col items-center justify-center text-center pt-32 md:pt-40">
                    <div className="space-y-12 mt-12 md:mt-20">
                        <div className="inline-flex items-center gap-3 px-6 py-2 rounded-2xl bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10 text-xs font-black uppercase tracking-[0.4em] shadow-xl backdrop-blur-xl">
                            <Command size={14} className="text-orange-500" />
                            <span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">Enterprise Grade SC-v3</span>
                        </div>

                        <div className="relative">
                            <h1 className="text-7xl sm:text-8xl md:text-[10rem] font-black uppercase leading-[0.75] tracking-tighter bg-gradient-to-b from-gray-950 via-gray-800 to-gray-500 dark:from-white dark:via-gray-300 dark:to-gray-600 bg-clip-text text-transparent py-4">
                                Precision Seat
                                <br />
                                Allocation
                            </h1>
                            {/* Reflection effect */}
                            <div className="absolute top-full left-0 right-0 h-40 bg-gradient-to-b from-orange-500/10 to-transparent blur-3xl rounded-full opacity-50 -z-10" />
                        </div>

                        <p className="text-xl md:text-3xl text-gray-700 dark:text-gray-300 max-w-4xl mx-auto font-bold leading-tight tracking-tight">
                            The definitive spatial intelligence platform for <br className="hidden md:block"/> high-frequency academic logistics.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-6 justify-center items-center pt-8">
                            <PremiumButton onClick={() => navigate('/signup')}>
                                Initialize System <ChevronRight size={22} />
                            </PremiumButton>
                            <PremiumButton variant="secondary" onClick={() => navigate('/login')}>
                                Command Center
                            </PremiumButton>
                        </div>

                        <div className="flex flex-wrap justify-center gap-6 pt-12">
                            {benefits.map((benefit, idx) => (
                                <div key={idx} className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-white/10 rounded-2xl shadow-sm border border-black/5 dark:border-white/5">
                                    <Star className="text-orange-500 fill-orange-500" size={14} />
                                    <span className="text-[10px] font-black text-gray-900 dark:text-gray-200 uppercase tracking-widest">{benefit}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="absolute bottom-10 flex flex-col items-center gap-4">
                        <div className="w-px h-24 bg-gradient-to-b from-orange-500 via-orange-500/20 to-transparent" />
                        <span className="text-[10px] uppercase font-black tracking-[0.6em] text-gray-400 rotate-90 origin-left ml-2">Protocol-101</span>
                    </div>
                </header>

                {/* Features Section */}
                <section className="space-y-20">
                    <div className="flex flex-col items-center text-center space-y-4">
                        <div className="p-4 rounded-3xl bg-orange-500/10 text-orange-500 w-fit">
                            <Layers size={32} />
                        </div>
                        <h2 className="text-5xl md:text-7xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Core Technologies</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {features.map((feature, index) => (
                            <FeatureCard key={index} feature={feature} index={index} />
                        ))}
                    </div>
                </section>

                {/* Workflow Section */}
                <section className="relative py-40 rounded-[5rem] bg-gray-950 dark:bg-white/[0.03] border border-white/10 overflow-hidden px-12 md:px-24">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-orange-500/10 via-transparent to-transparent opacity-50" />
                    
                    <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-20 items-center">
                        <div className="lg:col-span-4 text-left space-y-8">
                            <h2 className="text-6xl font-black text-white uppercase tracking-tighter leading-[0.8]">One Flow. <br/> <span className="text-gray-700">Infinite</span> <br/> Results.</h2>
                            <p className="text-gray-300 font-bold leading-relaxed">We've distilled hours of administrative complexity into three tactical steps. Engineered for the operator.</p>
                            <PremiumButton variant="secondary" className="!bg-orange-500 !text-white !border-none px-6 py-4">Documentation <ArrowRight size={18} /></PremiumButton>
                        </div>
                        
                        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-16">
                            {[
                                { num: '01', title: 'Tactical Sync', desc: 'Secure high-speed ingestion of student rosters.', icon: Upload },
                                { num: '02', title: 'Pivot Mapping', desc: 'Define multi-departmental seating constraints.', icon: Layout },
                                { num: '03', title: 'Vector Grid', desc: 'Synthesize optimal seating maps instantly.', icon: Download }
                            ].map((step, idx) => (
                                <WorkflowStep key={idx} step={step} idx={idx} />
                            ))}
                        </div>
                    </div>
                </section>

                {/* Stats / Tech Details */}
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-24 py-20 items-center">
                    <div className="space-y-16">
                        <div className="space-y-8">
                            <div className="text-7xl md:text-[8rem] font-black text-orange-500 leading-none tracking-tighter">99.9%</div>
                            <h3 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Human Error Reduction</h3>
                            <p className="text-lg text-gray-700 dark:text-gray-300 font-bold leading-relaxed">Our spatial solver eliminates departmental overlap and ensures strict social distancing patterns automatically.</p>
                        </div>
                        
                        <div className="flex gap-4">
                            <div className="flex-1 p-8 rounded-[3rem] bg-white dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-4">
                                <Cpu size={32} className="text-orange-500" />
                                <div className="text-2xl font-black dark:text-white">SC-v3 Core</div>
                                <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Processing Node</div>
                            </div>
                            <div className="flex-1 p-8 rounded-[3rem] bg-orange-500 text-white space-y-4 shadow-2xl shadow-orange-500/30">
                                <Star size={32} className="text-white/80" />
                                <div className="text-2xl font-black">Zero Leakage</div>
                                <div className="text-xs font-bold text-white/60 uppercase tracking-widest">Data Privacy</div>
                            </div>
                        </div>
                    </div>

                    <div className="relative group aspect-square rounded-[6rem] bg-gray-900 dark:bg-black p-1 shadow-2xl overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/40 to-transparent group-hover:opacity-60 transition-opacity" />
                        <div className="relative h-full w-full rounded-[5.8rem] bg-[#0a0a0a] overflow-hidden flex items-center justify-center p-20">
                            <div className="grid grid-cols-10 gap-2 opacity-30 group-hover:opacity-50 transition-opacity">
                                {gridCells.map((i) => (
                                    <div key={i} className={`aspect-square rounded-sm ${i % 11 === 0 ? 'bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.8)]' : 'bg-gray-800'}`} />
                                ))}
                            </div>
                            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 pointer-events-none">
                                <div className="text-2xl font-black text-white/20 uppercase tracking-[.5em]">System-Active</div>
                                <Sparkles size={120} className="text-orange-500/20 group-hover:text-orange-500/60 group-hover:scale-125 transition-all duration-700" />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Final Footer */}
                <footer className="text-center py-40 space-y-16 border-t border-black/5 dark:border-white/5 relative">
                    <div className="space-y-8 relative z-10">
                        <h2 className="text-6xl md:text-9xl font-black text-gray-950 dark:text-white uppercase tracking-tighter leading-none">Limitless <br/> <span className="text-orange-500">Logistics.</span></h2>
                        <p className="text-xl md:text-2xl text-gray-700 dark:text-gray-300 font-black max-w-3xl mx-auto uppercase tracking-tighter">Are you ready to redefine operational excellence?</p>
                        <PremiumButton className="mx-auto" onClick={() => navigate('/signup')}>Join the Network <MousePointer2 size={24} /></PremiumButton>
                    </div>
                    
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500 to-transparent opacity-30" />
                    
                    <div className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-[0.8em] pt-20">
                        Intelligent Seat Allocation System &bull; Protocol SC-v3-PRO &bull; {new Date().getFullYear()}
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default LandingPage;