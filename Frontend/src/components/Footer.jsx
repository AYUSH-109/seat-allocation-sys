import React from 'react';

const Footer = () => {
  return (
    <footer className="bg-gray-800 dark:bg-gray-950 text-white py-8 mt-auto transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-lg font-semibold mb-3">SeatAlloc System</h3>
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              Efficient seat allocation system for educational institutions.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-3">Quick Links</h3>
            <ul className="space-y-2 text-sm text-gray-400 dark:text-gray-500">
              <li><a href="#about" className="hover:text-white transition">About</a></li>
              <li><a href="#docs" className="hover:text-white transition">Documentation</a></li>
              <li><a href="#support" className="hover:text-white transition">Support</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-3">Contact</h3>
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              Email: support@seatalloc.com<br />
              Phone: +1 (555) 123-4567
            </p>
          </div>
        </div>
        <div className="border-t border-gray-700 dark:border-gray-800 mt-8 pt-6 text-center text-sm text-gray-400 dark:text-gray-500">
          © 2025 SeatAlloc System. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;