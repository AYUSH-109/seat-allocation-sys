import React from 'react';

// --- Component for Team Member Card (Used within AboutUs) ---
const TeamMemberCard = ({ initials, name, role, description }) => (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-lg text-center shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/20 w-full sm:w-56 border border-gray-200 dark:border-blue-500/50">
        {/* Avatar/Image Placeholder */}
        <div className="w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center text-3xl font-bold bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-white border-4 border-blue-500 dark:border-blue-500 transition-colors duration-300">
            {initials}
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-1 transition-colors duration-300">{name}</h3>
        <p className="text-gray-600 dark:text-gray-300 font-medium mb-3 text-sm transition-colors duration-300">{role}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-300">
            {description}
        </p>
    </div>
);

// --- The Main About Us Component ---
const AboutUs = () => {
    const teamMembers = [
        { initials: "JL", name: "Javier Lopez", role: "Project Lead", description: "Oversaw the entire system architecture and core constraints definition." },
        { initials: "AR", name: "Anjali Rao", role: "Lead Developer", description: "Primary engineer for the back-end allocation algorithm and API stability." },
        { initials: "MJ", name: "Mikael Jones", role: "UI/UX Designer", description: "Designed the dark theme interface and ensured high-fidelity user experience." },
        { initials: "ST", name: "Sara Tan", role: "Algorithm Specialist", description: "Optimized the constraint satisfaction problem (CSP) solver for speed and fairness." },
        { initials: "DB", name: "David Bell", role: "Documentation & QA", description: "Handled rigorous testing and produced clear, accessible system documentation." },
    ];

    return (
        // Outermost container with dark mode support
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
            <div className="text-gray-900 dark:text-white p-4 sm:p-10 pt-0 transition-colors duration-300"> 
                <div className="max-w-6xl mx-auto space-y-20">

                    {/* --- I. Hero/Mission Section --- */}
                    <section className="pt-8 pb-12 text-center border-b border-gray-200 dark:border-gray-800/50 transition-colors duration-300">
                        <h1 className="text-5xl sm:text-7xl font-extrabold tracking-widest text-gray-900 dark:text-white uppercase leading-none transition-colors duration-300">
                            AUTOMATED SEAT ALLOCATION
                        </h1>
                        <h2 className="mt-4 text-xl sm:text-3xl font-light text-gray-600 dark:text-gray-300 tracking-wide transition-colors duration-300">
                            SIMPLIFYING EXAM INTEGRITY.
                        </h2>
                    </section>

                    {/* --- II. Mission Text --- */}
                    <section className="max-w-4xl mx-auto px-4">
                        <h2 className="text-3xl font-bold mb-8 uppercase text-center text-gray-900 dark:text-white transition-colors duration-300">
                            OUR MISSION
                        </h2>
                        <p className="text-lg leading-relaxed text-gray-600 dark:text-gray-300 text-center transition-colors duration-300">
                            The *Automated Seat Allocation System* is driven by a single mission: to modernize and simplify the administrative burden of conducting large-scale examinations. We aim to replace error-prone manual processes with a fast, fair, and reliable technological solution that ensures integrity and maximizes efficiency.
                        </p>
                    </section>

                    {/* --- III. Core Pillars/Values --- */}
                    <section className="bg-gray-100 dark:bg-slate-900 py-16 px-4 rounded-xl shadow-inner shadow-gray-200 dark:shadow-gray-800 transition-colors duration-300">
                        <h2 className="text-3xl font-bold mb-12 uppercase text-center text-gray-900 dark:text-white transition-colors duration-300">
                            OUR CORE VALUES
                        </h2>
                        
                        <div className="flex flex-wrap justify-center gap-8">
                            
                            {/* Value 1: Integrity */}
                            <div className="w-full sm:w-1/3 min-w-[280px] p-6 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 transition-colors duration-300">
                                <h3 className="text-2xl font-semibold text-blue-600 dark:text-blue-500 mb-3 transition-colors duration-300">INTEGRITY</h3>
                                <p className="text-base text-gray-600 dark:text-gray-400 transition-colors duration-300">Ensuring a bias-free and cheat-proof environment by enforcing strict non-adjacent seating rules automatically.</p>
                            </div>

                            {/* Value 2: Efficiency */}
                            <div className="w-full sm:w-1/3 min-w-[280px] p-6 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 transition-colors duration-300">
                                <h3 className="text-2xl font-semibold text-blue-600 dark:text-blue-500 mb-3 transition-colors duration-300">EFFICIENCY</h3>
                                <p className="text-base text-gray-600 dark:text-gray-400 transition-colors duration-300">Automating complex constraint-checking, reducing allocation time from hours to mere seconds.</p>
                            </div>

                            {/* Value 3: Clarity */}
                            <div className="w-full sm:w-1/3 min-w-[280px] p-6 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 transition-colors duration-300">
                                <h3 className="text-2xl font-semibold text-blue-600 dark:text-blue-500 mb-3 transition-colors duration-300">CLARITY</h3>
                                <p className="text-base text-gray-600 dark:text-gray-400 transition-colors duration-300">Providing simple, structured, and easy-to-read output, including the AI-generated Invigilation Guide.</p>
                            </div>
                        </div>
                    </section>

                    {/* --- IV. Project Team Section (Developers) --- */}
                    <section className="py-12 px-4">
                        <h2 className="text-3xl font-bold mb-12 uppercase text-center text-gray-900 dark:text-white transition-colors duration-300">
                            PROJECT DEVELOPERS
                        </h2>
                        <div className="flex flex-wrap justify-center gap-8">
                            {teamMembers.map((member, index) => (
                                <TeamMemberCard 
                                    key={index} 
                                    initials={member.initials}
                                    name={member.name}
                                    role={member.role}
                                    description={member.description}
                                />
                            ))}
                        </div>
                        
                        <p className="mt-12 text-base text-gray-600 dark:text-gray-400 text-center max-w-3xl mx-auto transition-colors duration-300">
                            This system was developed as a Capstone Project aimed at bringing cutting-edge technology and optimization algorithms to academic logistics.
                        </p>
                    </section>
                    
                </div>
                {/* Footer */}
                <div className="text-center mt-16 py-4 border-t border-gray-300 dark:border-gray-900 text-gray-500 dark:text-gray-600 text-sm transition-colors duration-300">
                    &copy; {new Date().getFullYear()} Automated Seat Allocation System. All rights reserved.
                </div>
            </div>
        </div>
    );
}

export default AboutUs;