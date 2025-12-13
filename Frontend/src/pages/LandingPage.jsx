import React from 'react';
import { Upload, Layout, MapPin, Download } from 'lucide-react';

const LandingPage = ({ setCurrentPage }) => {
  const features = [
    {
      icon: Upload,
      title: 'Upload Student Data',
      description: 'Import student information via CSV for quick setup'
    },
    {
      icon: Layout,
      title: 'Configure Layout',
      description: 'Set up classroom seating arrangements with ease'
    },
    {
      icon: MapPin,
      title: 'Smart Allocation',
      description: 'Automatically allocate seats based on your criteria'
    },
    {
      icon: Download,
      title: 'Export Results',
      description: 'Download seat maps as PDF for printing and distribution'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-300">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6 transition-colors duration-300">
            Seat Allocation
            <span className="text-blue-600 dark:text-blue-400"> Made Simple</span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto transition-colors duration-300">
            Streamline your examination seating process with our intelligent allocation system.
            Upload, configure, and generate seat maps in minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => setCurrentPage('signup')}
              className="bg-blue-600 dark:bg-blue-500 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 dark:hover:bg-blue-600 transition shadow-lg"
            >
              Get Started
            </button>
            <button
              onClick={() => setCurrentPage('login')}
              className="bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 px-8 py-4 rounded-lg text-lg font-semibold border-2 border-blue-600 dark:border-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 transition"
            >
              Login
            </button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300"
            >
              <div className="bg-blue-100 dark:bg-blue-900 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <feature.icon className="text-blue-600 dark:text-blue-400" size={24} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Workflow Section */}
        <div className="mt-24 bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-12 transition-colors duration-300">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-blue-600 dark:bg-blue-500 text-white w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Upload Data</h3>
              <p className="text-gray-600 dark:text-gray-400">Import your student list and exam details</p>
            </div>
            <div className="text-center">
              <div className="bg-blue-600 dark:bg-blue-500 text-white w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Configure Rooms</h3>
              <p className="text-gray-600 dark:text-gray-400">Set up classroom layouts and constraints</p>
            </div>
            <div className="text-center">
              <div className="bg-blue-600 dark:bg-blue-500 text-white w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Generate & Export</h3>
              <p className="text-gray-600 dark:text-gray-400">Get your seat allocation map instantly</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;