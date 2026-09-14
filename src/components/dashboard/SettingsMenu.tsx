'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, ThemeToggle } from '@/components/ui';

interface SettingsMenuProps {
  /** Called after a successful health-data upload so the caller can refetch. */
  onHealthUploaded: () => void;
}

// Upload lives here (not HealthChart) so it's reachable from anywhere on the
// page, not just the Health tab — same /api/health POST + refetch pattern.
export function SettingsMenu({ onHealthUploaded }: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMessage(null);

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const response = await fetch('/api/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });

      const result = await response.json();
      if (result.success) {
        setUploadMessage('Uploaded');
        onHealthUploaded();
      } else {
        setUploadMessage(`Error: ${result.error}`);
      }
    } catch (err) {
      setUploadMessage(`Error: ${err instanceof Error ? err.message : 'Failed to upload'}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-10 h-10 flex items-center justify-center rounded-full border border-n-border-visible text-n-text-secondary hover:text-n-text-primary hover:border-n-text-secondary transition-all duration-200"
        aria-label="Settings"
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-n-surface border border-n-border-visible rounded-nothing-sm shadow-lg z-20 p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled mb-3">Settings</p>

          <div className="mb-3">
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} variant="secondary" size="sm" className="w-full">
              {uploading ? 'Uploading...' : 'Upload Health JSON'}
            </Button>
            {uploadMessage && (
              <p className={`font-mono text-[10px] mt-2 ${uploadMessage.startsWith('Error') ? 'text-n-accent' : 'text-n-success'}`}>
                {uploadMessage}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-n-border">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary">Theme</span>
            <ThemeToggle />
          </div>
        </div>
      )}
    </div>
  );
}
