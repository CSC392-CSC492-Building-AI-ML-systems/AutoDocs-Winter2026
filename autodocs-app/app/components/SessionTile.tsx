import { Clock, FileText } from 'lucide-react';

interface SessionTileProps {
  title: string;
  date: string;
  duration: string;
  preview: string;
  onClick?: () => void;
}

export function SessionTile({ title, date, duration, preview, onClick }: SessionTileProps) {
  return (
    <div 
      className="bg-card rounded-xl border border-border p-6 hover:bg-accent/10 transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <FileText className="w-6 h-6 text-primary" />
        </div>
        <div className="flex items-center gap-1 text-muted-foreground text-sm">
          <Clock className="w-4 h-4" />
          <span>{duration}</span>
        </div>
      </div>

      <h3 className="text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-3">{date}</p>
      
      <div className="bg-muted rounded-md p-3 mt-4">
        <code className="text-xs text-muted-foreground font-mono">
          {preview}
        </code>
      </div>
    </div>
  );
}