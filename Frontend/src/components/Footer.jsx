import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

const Footer = () => {
  const navigate = useNavigate();

  return (
    <footer className="bg-white dark:bg-[#050505] text-gray-800 dark:text-gray-200 py-8 mt-auto transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-3 text-orange-600 dark:text-orange-400">SeatAlloc System</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Efficient seat allocation system for educational institutions.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-3 text-orange-600 dark:text-orange-400">Quick Links</h3>
            <div className="flex gap-4">
              <a 
                href="/aboutus"
                onClick={(event) => {
                  event.preventDefault();
                  navigate('/aboutus');
                }}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/20 transition"
                title="About SeatAlloc"
                aria-label="Open About page"
              >
                <BookOpen size={20} />
              </a>
            </div>
          </div>
        </div>
        <div className="mt-8">
          <div className="h-1 w-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-sm mb-4" />
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            © 2025 SeatAlloc System. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;