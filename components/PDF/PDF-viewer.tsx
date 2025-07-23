'use client';

import { useState } from 'react';
import { Loader2, AlertTriangle, FileText, Download, ExternalLink } from 'lucide-react';

interface PDFViewerProps {
  fileUrl: string;
  fileName?: string;
}

/**
 * A component to display PDF files using an embedded viewer.
 * It handles loading and error states for a smooth user experience.
 */
const PDFViewer = ({ fileUrl, fileName = 'document.pdf' }: PDFViewerProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // We use the Google Docs viewer to embed the PDF. This provides a consistent
  // UI and works across all browsers without requiring a native PDF plugin.
  const embedUrl = `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    link.click();
  };

  return (
    <div className="w-full h-full bg-[#0d1117] rounded-lg overflow-hidden relative">
      {/* Header Bar */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-[#161b22] border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <FileText className="w-5 h-5 text-slate-400" />
          <span className="text-sm font-medium text-slate-300">{fileName}</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleDownload}
            className="p-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-md text-slate-300 hover:text-white transition-all"
            title="Download PDF"
          >
            <Download className="w-4 h-4" />
          </button>
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-md text-slate-300 hover:text-white transition-all"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full h-full pt-14 bg-slate-900">
        {/* Loading Indicator */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d1117] transition-opacity duration-300">
            <div className="p-8 rounded-lg bg-[#161b22] shadow-lg">
              <Loader2 className="w-12 h-12 animate-spin text-slate-400 mx-auto" />
              <p className="mt-4 text-sm text-slate-400 font-medium">Loading document...</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-[#0d1117]">
            <div className="p-8 rounded-lg bg-[#161b22] shadow-lg max-w-md">
              <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-red-400 mb-2">Failed to Load PDF</h3>
              <p className="text-sm text-slate-400 mb-6">
                The document preview is unavailable. This might be due to file size or format restrictions.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-sm font-medium text-white transition-all"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF
                </button>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium text-white transition-all"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open in New Tab
                </a>
              </div>
            </div>
          </div>
        )}

        {/* The Iframe that contains the PDF */}
        <iframe
          src={embedUrl}
          className={`w-full h-full border-0 bg-white transition-opacity duration-500 ${
            loading || error ? 'opacity-0' : 'opacity-100'
          }`}
          title="PDF Viewer"
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
      </div>
    </div>
  );
};

export default PDFViewer;