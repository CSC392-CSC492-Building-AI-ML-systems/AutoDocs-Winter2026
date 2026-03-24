"use client"
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useState, useRef } from 'react';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export function UploadTile({ onUploadSuccess }: { onUploadSuccess?: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      void handleFileUpload(files[0]);
    }
  };

  const handleClick = () => {
    if (uploadState === 'uploading') return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      void handleFileUpload(files[0]);
    }
    // Reset input so the same file can be re-uploaded if needed
    e.target.value = '';
  };

  const handleFileUpload = async (file: File) => {
    setUploadState('uploading');
    setErrorMessage(null);

    try {
      const title = file.name.replace(/\.[^/.]+$/, '');
      const formData = new FormData();
      formData.set('file', file, file.name);
      formData.set('title', title);

      const res = await fetch('/api/terminal-sessions/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `Upload failed with status ${res.status}`);
      }

      setUploadState('success');
      onUploadSuccess?.();

      // Reset back to idle after a moment
      setTimeout(() => setUploadState('idle'), 2500);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed.');
      setUploadState('error');
      setTimeout(() => setUploadState('idle'), 3000);
    }
  };

  const stateConfig = {
    idle: {
      icon: <Upload className="w-8 h-8 text-primary" />,
      iconBg: 'bg-primary/10 group-hover:bg-primary/20',
      title: 'Upload Session',
      subtitle: 'Drop terminal recording here or click to browse',
      badge: <div className="px-4 py-2 bg-primary text-primary-foreground rounded-lg group-hover:bg-primary/90 transition-colors">Choose File</div>,
    },
    uploading: {
      icon: <Loader2 className="w-8 h-8 text-primary animate-spin" />,
      iconBg: 'bg-primary/10',
      title: 'Uploading...',
      subtitle: 'Please wait while your session is being uploaded',
      badge: null,
    },
    success: {
      icon: <CheckCircle className="w-8 h-8 text-emerald-400" />,
      iconBg: 'bg-emerald-400/10',
      title: 'Upload Successful',
      subtitle: 'Your session has been added',
      badge: null,
    },
    error: {
      icon: <AlertCircle className="w-8 h-8 text-destructive" />,
      iconBg: 'bg-destructive/10',
      title: 'Upload Failed',
      subtitle: errorMessage ?? 'Something went wrong. Please try again.',
      badge: null,
    },
  };

  const cfg = stateConfig[uploadState];

  return (
    <div
      className={`bg-card rounded-xl border-2 border-dashed p-6 transition-all group ${
        uploadState === 'uploading'
          ? 'cursor-wait border-border opacity-70'
          : uploadState === 'success'
          ? 'cursor-default border-emerald-500/40'
          : uploadState === 'error'
          ? 'cursor-pointer border-destructive/40'
          : isDragging
          ? 'cursor-copy border-primary bg-primary/5'
          : 'cursor-pointer border-border hover:border-primary'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".xml,.cast,.rec,.asciinema"
        onChange={handleFileChange}
      />

      <div className="flex flex-col items-center justify-center h-full min-h-[200px]">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors ${cfg.iconBg}`}>
          {cfg.icon}
        </div>

        <h3 className="text-foreground mb-2">{cfg.title}</h3>
        <p className={`text-sm text-center mb-4 ${uploadState === 'error' ? 'text-destructive/80' : 'text-muted-foreground'}`}>
          {cfg.subtitle}
        </p>

        {cfg.badge}

        {uploadState === 'idle' && (
          <p className="text-xs text-muted-foreground mt-4">
            Supports .xml, .cast, .rec, .asciinema
          </p>
        )}
      </div>
    </div>
  );
}
