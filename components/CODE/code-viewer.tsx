'use client';

import { useEffect, useState } from 'react';
// --- FIX: Import the new singleton getter and helper function ---
import { getShikiHighlighter, getLanguageFromUrl } from '@/lib/shiki';
import { Loader2, AlertTriangle, Copy, Check } from 'lucide-react';

interface CodeViewerProps {
  fileUrl: string;
}

/**
 * A component to fetch and display code files using a shared Shiki instance.
 */
const CodeViewer = ({ fileUrl }: CodeViewerProps) => {
  const [highlightedHtml, setHighlightedHtml] = useState('');
  const [rawCode, setRawCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lineCount, setLineCount] = useState(0);

  useEffect(() => {
    const fetchAndHighlightCode = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch the highlighter and the code concurrently for performance.
        const [highlighter, response] = await Promise.all([
          getShikiHighlighter(),
          fetch(fileUrl)
        ]);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch code file: ${response.statusText}`);
        }
        
        const text = await response.text();
        setRawCode(text);
        
        // Calculate line count - trim trailing newlines but preserve code structure
        const trimmedText = text.replace(/\n+$/, '');
        const lines = trimmedText.split('\n').length;
        setLineCount(lines);

        const language = getLanguageFromUrl(fileUrl);
        
        // Ensure the language is loaded before trying to use it.
        // This prevents errors if a language wasn't in the pre-loaded list.
        const loadedLanguages = highlighter.getLoadedLanguages();
        if (!loadedLanguages.includes(language)) {
          await highlighter.loadLanguage(language);
        }

        const html = highlighter.codeToHtml(text, { 
          lang: language, 
          theme: 'github-dark' 
        });
        setHighlightedHtml(html);

      } catch (err: any) {
        console.error("Shiki Error:", err);
        setError(err.message || 'An unknown error occurred during highlighting.');
      } finally {
        setLoading(false);
      }
    };

    if (fileUrl) {
      fetchAndHighlightCode();
    }
  }, [fileUrl]);

  const handleCopy = () => {
    if (rawCode) {
      navigator.clipboard.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0d1117] rounded-lg">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center bg-[#0d1117] rounded-lg">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="font-semibold text-red-400">Failed to Load Code</h3>
        <p className="text-sm text-slate-400 mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[#0d1117] rounded-lg overflow-hidden relative">
      <button
        onClick={handleCopy}
        className="absolute top-4 right-4 z-10 p-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-md text-slate-300 hover:text-white transition-all"
        title="Copy code"
      >
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
      </button>
      
      <div className="h-full overflow-auto">
        <div className="flex min-h-full">
          {/* Line numbers column */}
          <div className="flex-shrink-0 py-4 pr-4 pl-4 text-right select-none bg-[#0d1117] border-r border-slate-800 sticky left-0">
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i + 1} className="text-sm leading-6 text-slate-500 font-mono">
                {i + 1}
              </div>
            ))}
          </div>
          
          {/* Code content */}
          <div className="flex-1 min-w-0">
            <div 
              className="shiki-container py-4 px-4 text-sm [&>pre]:!bg-transparent [&>pre]:!p-0 [&>pre>code]:leading-6"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }} 
            />
          </div>
        </div>
      </div>
      
      <style jsx>{`
        .shiki-container :global(pre) {
          margin: 0;
          overflow: visible;
        }
        .shiki-container :global(code) {
          display: block;
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
        }
      `}</style>
    </div>
  );
};

export default CodeViewer;