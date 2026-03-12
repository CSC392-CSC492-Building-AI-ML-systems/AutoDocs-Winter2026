import { X, Download, Share2, Trash2 } from 'lucide-react';

interface SessionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: {
    title: string;
    date: string;
    duration: string;
    preview: string;
  } | null;
}

export function SessionDetailModal({ isOpen, onClose, session }: SessionDetailModalProps) {
  if (!isOpen || !session) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl border border-border max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-foreground">{session.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {session.date} • {session.duration}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-lg hover:bg-accent flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-auto max-h-[calc(90vh-200px)]">
          <div className="bg-muted rounded-lg p-6">
            <pre className="text-sm text-foreground font-mono whitespace-pre-wrap">
              {session.preview}
            </pre>
          </div>

          {/* Documentation Section */}
          <div className="mt-6">
            <h3 className="text-foreground mb-3">Generated Documentation</h3>
            <div className="bg-background/50 rounded-lg p-6 border border-border">
              <p className="text-sm text-muted-foreground mb-4">
                This session demonstrates a database migration process using npm scripts.
              </p>
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm text-foreground mb-1">Steps Executed:</h4>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>Initialized migration script</li>
                    <li>Connected to database</li>
                    <li>Applied schema changes</li>
                    <li>Verified migrations</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-6 border-t border-border">
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
