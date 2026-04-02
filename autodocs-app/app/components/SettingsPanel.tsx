"use client";

import { useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';

const MASKED_PASSWORD = '........';

function ChangeButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-border bg-primary/10 px-4 py-2 text-sm text-primary transition-colors hover:bg-primary/20 sm:self-center"
    >
      <KeyRound className="h-4 w-4" />
      <span>Change</span>
    </button>
  );
}

export function SettingsPanel() {
  const [isEditing, setIsEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const resetEditor = () => {
    setIsEditing(false);
    setCurrentPassword('');
    setNewPassword('');
    setShowNewPassword(false);
    setErrorMessage(null);
  };

  const openEditor = () => {
    setIsEditing(true);
    setCurrentPassword('');
    setNewPassword('');
    setShowNewPassword(false);
    setErrorMessage(null);
    setStatusMessage(null);
  };

  const handleSave = async () => {
    if (!currentPassword || !newPassword) return;

    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await fetch('/api/auth/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? `Request failed with status ${response.status}`);
      }

      setStatusMessage(data.message ?? 'Password updated successfully.');
      resetEditor();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update password.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveDisabled = isSaving || !currentPassword || !newPassword;

  return (
    <section className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-foreground mb-1">Settings</h1>
        <p className="text-muted-foreground">
          Manage security and account access.
        </p>
      </div>

      <div className="space-y-5">
        <div className="bg-card rounded-xl border border-border p-6 hover:bg-accent/10 transition-colors">
          <p className="mb-5 text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
            Security
          </p>

          {statusMessage && (
            <div className="mb-5 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
              {statusMessage}
            </div>
          )}

          <div
            className={`flex flex-col gap-4 sm:flex-row sm:justify-between ${
              isEditing ? 'sm:items-start' : 'sm:items-center'
            }`}
          >
            <div className={`flex flex-1 gap-4 ${isEditing ? 'items-start' : 'items-center'}`}>
              <div className="flex h-11 w-11 shrink-0 self-start items-center justify-center rounded-lg bg-primary/10 text-primary">
                <KeyRound className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">Password</p>
                {!isEditing && (
                  <p className="mt-2 text-base tracking-[0.28em] text-foreground">{MASKED_PASSWORD}</p>
                )}

                {isEditing && (
                  <div className="mt-2 space-y-2.5">
                    <p className="text-xs text-muted-foreground">
                      Enter your current password and choose a new password.
                    </p>

                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      placeholder="Current password"
                      className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary"
                    />

                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder="New password"
                        className="w-full rounded-lg border border-border bg-muted px-3 py-2 pr-11 text-sm text-foreground outline-none transition focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((current) => !current)}
                        className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    {errorMessage && (
                      <p className="text-sm text-destructive">{errorMessage}</p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saveDisabled}
                        className="inline-flex items-center justify-center self-start rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={resetEditor}
                        disabled={isSaving}
                        className="inline-flex items-center justify-center self-start rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!isEditing && <ChangeButton onClick={openEditor} />}
          </div>
        </div>
      </div>
    </section>
  );
}
