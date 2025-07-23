import { createHighlighter, Highlighter, BundledLanguage, BundledTheme } from 'shiki';

// This is the singleton instance of the highlighter.
// It will be populated once and then reused.
let highlighter: Highlighter | undefined;

/**
 * A singleton getter for the Shiki highlighter.
 * Ensures that the highlighter is initialized only once.
 * @returns A promise that resolves to the highlighter instance.
 */
export const getShikiHighlighter = async () => {
  if (!highlighter) {
    console.log('Initializing Shiki highlighter...');
    highlighter = await createHighlighter({
      themes: ['github-dark'],
      // Pre-load common languages for faster highlighting on first use.
      langs: [
        'javascript', 'jsx', 'typescript', 'tsx', 'python', 
        'cpp', 'c', 'java', 'csharp', 'html', 'css', 'json', 
        'markdown', 'shell'
      ],
    });
  }
  return highlighter;
};

/**
 * Maps a file extension to a supported Shiki language identifier.
 * @param url The URL or filename to extract the extension from.
 * @returns A Shiki language identifier (e.g., 'typescript').
 */
export const getLanguageFromUrl = (url: string): BundledLanguage => {
  const extension = url.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'js': return 'javascript';
    case 'jsx': return 'jsx';
    case 'ts': return 'typescript';
    case 'tsx': return 'tsx';
    case 'py': return 'python';
    case 'cpp': return 'cpp';
    case 'c': return 'c';
    case 'java': return 'java';
    case 'cs': return 'csharp';
    case 'html': return 'html';
    case 'css': return 'css';
    case 'json': return 'json';
    case 'md': return 'markdown';
    case 'sh': return 'shell';
    default: return 'text' as BundledLanguage; // fallback
  }
};