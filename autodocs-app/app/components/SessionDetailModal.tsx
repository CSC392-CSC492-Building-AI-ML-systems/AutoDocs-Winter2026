import { X, Download, Share2, Trash2, GitBranch, CornerDownRight, LogOut, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { Session, SessionEvent } from '@/app/home/page';

interface SessionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
}

interface TreeNode {
  event: SessionEvent;
  index: number;
  children: TreeNode[];
}

/**
 * Build a hierarchical tree from the flat event list.
 *
 * Rules:
 *  - depth === 0  → top-level / independent event
 *  - depth === -1 → subevent: child of the most recent non-subevent
 *  - depth >= 1   → exiting event: top-level but visually distinct
 */
function buildTree(events: SessionEvent[]): TreeNode[] {
  const roots: TreeNode[] = [];
  let lastTopLevel: TreeNode | null = null;

  events.forEach((event, index) => {
    const node: TreeNode = { event, index, children: [] };

    if (event.depth === -1) {
      // Attach as child of the most recent top-level node
      if (lastTopLevel) {
        lastTopLevel.children.push(node);
      } else {
        // No parent yet — treat as root
        roots.push(node);
      }
    } else {
      // depth 0 or >=1 → always a root node
      roots.push(node);
      lastTopLevel = node;
    }
  });

  return roots;
}

function DepthIcon({ depth }: { depth: number }) {
  if (depth === -1) return <CornerDownRight className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />;
  if (depth >= 1) return <LogOut className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
  return <GitBranch className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />;
}

function depthLabel(depth: number): string {
  if (depth === -1) return 'Subevent';
  if (depth >= 1) return 'Exit';
  return 'Event';
}

function depthColorClass(depth: number): string {
  if (depth === -1) return 'border-blue-500/20 bg-blue-500/5';
  if (depth >= 1) return 'border-amber-500/20 bg-amber-500/5';
  return 'border-border bg-card';
}

function depthTextClass(depth: number): string {
  if (depth === -1) return 'text-blue-300/80';
  if (depth >= 1) return 'text-amber-300/80';
  return 'text-foreground';
}

function EventNode({ node, defaultOpen = true }: { node: TreeNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = node.children.length > 0;

  return (
    <div className="relative">
      {/* Main event row */}
      <div
        className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${depthColorClass(node.event.depth)} ${hasChildren ? 'cursor-pointer hover:bg-accent/10' : ''}`}
        onClick={hasChildren ? () => setOpen((o) => !o) : undefined}
      >
        {/* Expand toggle */}
        {hasChildren ? (
          <ChevronRight
            className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-muted-foreground transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
        ) : (
          <div className="w-3.5 flex-shrink-0" />
        )}

        <DepthIcon depth={node.event.depth} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[10px] font-mono uppercase tracking-wider ${
              node.event.depth === -1 ? 'text-blue-400' :
              node.event.depth >= 1  ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {depthLabel(node.event.depth)}
            </span>
            {hasChildren && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {node.children.length} sub-event{node.children.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className={`text-sm font-mono leading-snug ${depthTextClass(node.event.depth)}`}>
            {node.event.label}
          </p>
        </div>
      </div>

      {/* Children */}
      {hasChildren && open && (
        <div className="ml-6 mt-1 space-y-1 relative">
          {/* Vertical connector line */}
          <div className="absolute left-0 top-0 bottom-0 w-px bg-border/60" style={{ left: '-12px' }} />
          {node.children.map((child) => (
            <EventNode key={child.index} node={child} defaultOpen={true} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SessionDetailModal({ isOpen, onClose, session }: SessionDetailModalProps) {
  if (!isOpen || !session) return null;

  const tree = buildTree(session.content);

  const eventCounts = {
    total: session.content.length,
    independent: session.content.filter((e) => e.depth === 0).length,
    sub: session.content.filter((e) => e.depth === -1).length,
    exiting: session.content.filter((e) => e.depth >= 1).length,
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl border border-border max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-foreground">{session.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {session.createdAt} · {session.duration}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-lg hover:bg-accent flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        {/* Event stats bar */}
        <div className="flex items-center gap-6 px-6 py-3 border-b border-border bg-muted/30 flex-shrink-0">
          <Stat label="Total events" value={eventCounts.total} />
          <div className="w-px h-4 bg-border" />
          <Stat label="Top-level" value={eventCounts.independent} color="text-emerald-400" dot="bg-emerald-400" />
          <Stat label="Subevents" value={eventCounts.sub} color="text-blue-400" dot="bg-blue-400" />
          <Stat label="Exiting" value={eventCounts.exiting} color="text-amber-400" dot="bg-amber-400" />
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-6 py-2 border-b border-border bg-background/30 flex-shrink-0">
          <span className="text-xs text-muted-foreground">Legend:</span>
          <LegendItem icon={<GitBranch className="w-3 h-3 text-emerald-400" />} label="Independent event" color="text-emerald-400" />
          <LegendItem icon={<CornerDownRight className="w-3 h-3 text-blue-400" />} label="Subevent (child)" color="text-blue-400" />
          <LegendItem icon={<LogOut className="w-3 h-3 text-amber-400" />} label="Exiting event" color="text-amber-400" />
        </div>

        {/* Hierarchical Event Tree */}
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-2">
            {tree.map((node) => (
              <EventNode key={node.index} node={node} defaultOpen={true} />
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-6 border-t border-border flex-shrink-0">
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </button>
            <button className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors flex items-center gap-2">
              <Share2 className="w-4 h-4" />
              Share
            </button>
          </div>
          <button className="px-4 py-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color = 'text-foreground',
  dot,
}: {
  label: string;
  value: number;
  color?: string;
  dot?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
      <span className={`text-sm font-mono font-medium ${color}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function LegendItem({
  icon,
  label,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className={`text-xs font-mono ${color}`}>{label}</span>
    </div>
  );
}