import { X, Download, Share2, Trash2, GitBranch, CornerDownRight, LogOut, ChevronRight, Loader2, CheckCircle, AlertCircle, UserPlus, TriangleAlert } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { Session, SessionEvent } from '@/app/home/page';
import { parseSessionContent } from '@/app/home/page';

interface SessionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
  onDeleteSession?: (id: string) => Promise<void>;
}

interface TreeNode {
  event: SessionEvent;
  index: number;
  children: TreeNode[];
}

function buildTree(events: SessionEvent[]): TreeNode[] {
  const roots: TreeNode[] = [];
  // Stack of ancestor nodes — top of stack is the current parent context.
  const stack: TreeNode[] = [];

  const currentChildren = () =>
    stack.length > 0 ? stack[stack.length - 1].children : roots;

  events.forEach((event, index) => {
    const node: TreeNode = { event, index, children: [] };

    if (event.depth === -1) {
      // Entering a deeper level: attach to current parent, then push onto stack
      // so subsequent events become children of this node.
      currentChildren().push(node);
      stack.push(node);
    } else if (event.depth === 0) {
      // Continuing at the same level: sibling of the current context.
      currentChildren().push(node);
    } else {
      // depth >= 1 — finishing a subtask: attach the exit node as the last child
      // of the current subtree, then pop back up (one level per depth unit).
      currentChildren().push(node);
      for (let i = 0; i < event.depth && stack.length > 0; i++) {
        stack.pop();
      }
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

function RootNode({ title, totalEvents, children }: { title: string; totalEvents: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="relative">
      <div
        className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 cursor-pointer hover:bg-accent/10 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight
          className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-muted-foreground transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
        <GitBranch className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">Session</span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {totalEvents} event{totalEvents !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-sm font-mono leading-snug text-foreground">{title}</p>
        </div>
      </div>

      {open && (
        <div className="ml-6 mt-1 space-y-1 relative">
          <div className="absolute top-0 bottom-0 w-px bg-border/60" style={{ left: '-12px' }} />
          {children}
        </div>
      )}
    </div>
  );
}

function EventNode({ node, defaultOpen = true }: { node: TreeNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = node.children.length > 0;

  return (
    <div className="relative">
      <div
        className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${depthColorClass(node.event.depth)} ${hasChildren ? 'cursor-pointer hover:bg-accent/10' : ''}`}
        onClick={hasChildren ? () => setOpen((o) => !o) : undefined}
      >
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

      {hasChildren && open && (
        <div className="ml-6 mt-1 space-y-1 relative">
          <div className="absolute top-0 bottom-0 w-px bg-border/60" style={{ left: '-12px' }} />
          {node.children.map((child) => (
            <EventNode key={child.index} node={child} defaultOpen={true} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Share Panel ────────────────────────────────────────────────────────────────

type ShareState = 'idle' | 'loading' | 'success' | 'error';

function SharePanel({ sessionId }: { sessionId: string }) {
  const [email, setEmail] = useState('');
  const [shareState, setShareState] = useState<ShareState>('idle');
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const handleShare = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setShareState('loading');
    setShareMessage(null);

    try {
      const res = await fetch('/api/terminal-sessions/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminalSessionId: sessionId, targetUserEmail: trimmed }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message ?? `Request failed with status ${res.status}`);
      }

      setShareState('success');
      setShareMessage(`Shared with ${data.sharedWith?.name ?? trimmed}`);
      setEmail('');
    } catch (err) {
      setShareState('error');
      setShareMessage(err instanceof Error ? err.message : 'Failed to share session.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void handleShare();
  };

  const isLoading = shareState === 'loading';

  return (
    <div className="border-t border-border px-6 py-4 bg-muted/20 flex-shrink-0">
      <p className="text-xs text-muted-foreground font-mono mb-3 flex items-center gap-1.5">
        <UserPlus className="w-3.5 h-3.5" />
        Share with a user by email
      </p>

      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (shareState !== 'idle') {
              setShareState('idle');
              setShareMessage(null);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="user@example.com"
          disabled={isLoading}
          className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        <button
          onClick={() => void handleShare()}
          disabled={isLoading || !email.trim()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {isLoading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Share2 className="w-4 h-4" />
          }
          Share
        </button>
      </div>

      {shareMessage && (
        <div className={`mt-2 flex items-center gap-1.5 text-xs font-mono ${shareState === 'success' ? 'text-emerald-400' : 'text-destructive'}`}>
          {shareState === 'success'
            ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
            : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          }
          {shareMessage}
        </div>
      )}
    </div>
  );
}

// ── Delete Control ─────────────────────────────────────────────────────────────

type DeleteState = 'idle' | 'confirm' | 'deleting' | 'success' | 'error';

interface DeleteControlProps {
  sessionTitle: string;
  deleteState: DeleteState;
  deleteError: string | null;
  onInitiate: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}

function DeleteControl({ sessionTitle, deleteState, deleteError, onInitiate, onConfirm, onCancel, onDismiss }: DeleteControlProps) {
  if (deleteState === 'idle') {
    return (
      <button
        onClick={onInitiate}
        className="px-4 py-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors flex items-center gap-2"
      >
        <Trash2 className="w-4 h-4" />
        Delete
      </button>
    );
  }

  if (deleteState === 'confirm') {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-destructive font-mono mr-1">
          <TriangleAlert className="w-3.5 h-3.5 flex-shrink-0" />
          Delete &ldquo;{sessionTitle}&rdquo;? This cannot be undone.
        </div>
        <button
          onClick={onConfirm}
          className="px-3 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors flex items-center gap-1.5 text-sm font-medium"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Confirm
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-sm"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (deleteState === 'deleting') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
        <Loader2 className="w-4 h-4 animate-spin text-destructive" />
        Deleting...
      </div>
    );
  }

  if (deleteState === 'success') {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-400 font-mono">
        <CheckCircle className="w-4 h-4" />
        Deleted
      </div>
    );
  }

  // error state
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 text-xs text-destructive font-mono">
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
        {deleteError ?? 'Delete failed.'}
      </div>
      <button
        onClick={onDismiss}
        className="px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-sm"
      >
        Dismiss
      </button>
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────

export function SessionDetailModal({ isOpen, onClose, session, onDeleteSession }: SessionDetailModalProps) {
  const [showSharePanel, setShowSharePanel] = useState(false);

  const [deleteState, setDeleteState] = useState<DeleteState>('idle');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const events = useMemo(
    () => (session ? parseSessionContent(session.content) : []),
    [session]
  );
  const tree = useMemo(() => buildTree(events), [events]);

  const handleClose = () => {
    setShowSharePanel(false);
    setDeleteState('idle');
    setDeleteError(null);
    onClose();
  };

  const handleDeleteConfirm = async () => {
    if (!session || !onDeleteSession) return;
    setDeleteState('deleting');
    setDeleteError(null);
    try {
      await onDeleteSession(session.id);
      setDeleteState('success');
      setTimeout(() => handleClose(), 1500);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete session.');
      setDeleteState('error');
    }
  };

  if (!isOpen || !session) return null;

  const isShared = !!session.owner;

  const eventCounts = {
    total: events.length,
    independent: events.filter((e) => e.depth === 0).length,
    sub: events.filter((e) => e.depth === -1).length,
    exiting: events.filter((e) => e.depth >= 1).length,
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl border border-border max-w-4xl w-full h-[90vh] overflow-hidden shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-foreground">{session.title}</h2>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              {session.createdAt} · {session.duration}
              {isShared && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-1.5 py-0.5 font-mono">
                  Shared by {session.owner!.name ?? session.owner!.email}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleClose}
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
          <RootNode title={session.title} totalEvents={eventCounts.total}>
            {tree.map((node) => (
              <EventNode key={node.index} node={node} defaultOpen={true} />
            ))}
          </RootNode>
        </div>

        {/* Share Panel — slides in above footer for owned sessions only */}
        {!isShared && showSharePanel && (
          <SharePanel sessionId={session.id} />
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-6 border-t border-border flex-shrink-0">
          <div className="flex gap-2">
            <button
              onClick={() => {
                const blob = new Blob([session.content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${session.title}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>

            {!isShared && (
              <button
                onClick={() => setShowSharePanel((s) => !s)}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                  showSharePanel
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
            )}
          </div>

          <DeleteControl
            sessionTitle={session.title}
            deleteState={deleteState}
            deleteError={deleteError}
            onInitiate={() => setDeleteState('confirm')}
            onConfirm={() => void handleDeleteConfirm()}
            onCancel={() => setDeleteState('idle')}
            onDismiss={() => setDeleteState('idle')}
          />
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