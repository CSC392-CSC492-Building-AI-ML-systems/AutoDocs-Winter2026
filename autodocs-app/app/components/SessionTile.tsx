import { Clock, FileText, GitBranch, CornerDownRight, LogOut } from 'lucide-react';
import { useMemo } from 'react';
import type { Session, SessionEvent } from '@/app/home/page';
import { parseSessionContent } from '@/app/home/page';

interface SessionTileProps {
  session: Session;
  onClick?: () => void;
}

function EventDepthBadge({ depth }: { depth: number }) {
  if (depth === -1) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
        <CornerDownRight className="w-2.5 h-2.5" />
        sub
      </span>
    );
  }
  if (depth >= 1) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <LogOut className="w-2.5 h-2.5" />
        exit
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      <GitBranch className="w-2.5 h-2.5" />
      event
    </span>
  );
}

export function SessionTile({ session, onClick }: SessionTileProps) {
  const { title, createdAt, duration, content } = session;

  const events = useMemo(() => parseSessionContent(content), [content]);

  const eventCounts = {
    independent: events.filter((e: SessionEvent) => e.depth === 0).length,
    sub: events.filter((e: SessionEvent) => e.depth === -1).length,
    exiting: events.filter((e: SessionEvent) => e.depth >= 1).length,
  };

  const previewEvents = events.slice(0, 3);

  return (
    <div
      className="bg-card rounded-xl border border-border p-6 hover:bg-accent/10 transition-all cursor-pointer group"
      onClick={onClick}
    >
      {/* Top row */}
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <FileText className="w-6 h-6 text-primary" />
        </div>
        <div className="flex items-center gap-1 text-muted-foreground text-sm">
          <Clock className="w-4 h-4" />
          <span>{duration}</span>
        </div>
      </div>

      {/* Title & date */}
      <h3 className="text-foreground mb-1 line-clamp-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-3">{createdAt}</p>

      {/* Event stats */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-muted-foreground font-mono">{events.length} events</span>
        <span className="text-border">·</span>
        <span className="text-xs text-emerald-400 font-mono">{eventCounts.independent} top-level</span>
        <span className="text-border">·</span>
        <span className="text-xs text-blue-400 font-mono">{eventCounts.sub} sub</span>
      </div>

      {/* Event preview list */}
      <div className="bg-muted rounded-md p-3 space-y-2">
        {previewEvents.map((event: SessionEvent, i: number) => (
          <div key={i} className="flex items-start gap-2">
            <div className="mt-0.5 flex-shrink-0">
              <EventDepthBadge depth={event.depth} />
            </div>
            <p className="text-xs text-muted-foreground font-mono leading-snug line-clamp-1">
              {event.label}
            </p>
          </div>
        ))}
        {events.length > 3 && (
          <p className="text-xs text-muted-foreground/50 font-mono pt-1">
            +{events.length - 3} more events...
          </p>
        )}
      </div>
    </div>
  );
}