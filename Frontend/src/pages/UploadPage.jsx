import React, { useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';

const UploadPage = ({ showToast }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      showToast('Please select a file', 'error');
      return;
    }

    setUploading(true);
    // TODO: Replace with actual API call
    // const formData = new FormData();
    // formData.append('file', file);
    // const response = await axios.post('/api/upload/students', formData);
    
    // Simulate API call
    setTimeout(() => {
      setUploading(false);
      showToast('File uploaded successfully!', 'success');
      setFile(null);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 transition-colors duration-300">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 transition-colors duration-300">
          <div className="text-center mb-8">
            <div className="bg-blue-600 dark:bg-blue-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Upload className="text-white" size={32} />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Upload Student Data</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">Upload a CSV file with student information</p>
          </div>

          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center hover:border-blue-500 dark:hover:border-blue-400 transition bg-gray-50 dark:bg-gray-700/50">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="text-gray-400 dark:text-gray-500 mx-auto mb-4" size={48} />
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                {file ? file.name : 'Click to upload or drag and drop'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">CSV files only (max 10MB)</p>
            </label>
          </div>

          {file && (
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <strong>Selected file:</strong> {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </p>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full mt-6 bg-blue-600 dark:bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 dark:hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Uploading...
              </>
            ) : (
              'Upload File'
            )}
          </button>

          <div className="mt-8 p-6 bg-gray-50 dark:bg-gray-700 rounded-lg transition-colors duration-300">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">CSV Format Requirements:</h3>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
              <li>• Include headers: Student ID and Name</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadPage;