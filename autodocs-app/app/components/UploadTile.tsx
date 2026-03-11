"use client"
import { Upload } from 'lucide-react';
import { useState, useRef } from 'react';

export function UploadTile() {
  const [isDragging, setIsDragging] = useState(false);
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
      handleFileUpload(files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = (file: File) => {
    console.log('Uploading file:', file.name);
    // Here you would handle the actual file upload
    // For now, just log it
  };

  return (
    <div
      className={`bg-card rounded-xl border-2 border-dashed p-6 transition-all cursor-pointer group ${
        isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary'
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
        accept=".cast,.ttyrec,.log"
        onChange={handleFileChange}
      />
      <div className="flex flex-col items-center justify-center h-full min-h-[200px]">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
          <Upload className="w-8 h-8 text-primary" />
        </div>
        
        <h3 className="text-foreground mb-2">Upload Session</h3>
        <p className="text-sm text-muted-foreground text-center mb-4">
          Drop terminal recording here or click to browse
        </p>
        
        <div className="px-4 py-2 bg-primary text-primary-foreground rounded-lg group-hover:bg-primary/90 transition-colors">
          Choose File
        </div>
        
        <p className="text-xs text-muted-foreground mt-4">
          Supports .cast, .ttyrec, .log
        </p>
      </div>
    </div>
  );
}