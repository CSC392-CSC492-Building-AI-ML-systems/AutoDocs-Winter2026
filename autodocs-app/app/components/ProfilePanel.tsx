"use client";

import { useEffect, useState, type ReactNode } from 'react';
import { Mail, Pencil, UserRound } from 'lucide-react';
import { setUser, type AuthUser } from '@/app/lib/auth';

interface ProfilePanelProps {
  user: AuthUser;
  onUserChange: (user: AuthUser) => void;
}

interface DetailRowProps {
  icon: ReactNode;
  label: string;
  value: string;
  actionLabel?: string;
  requiresPassword?: boolean;
  isEditing?: boolean;
  draftValue?: string;
  currentPassword?: string;
  inputType?: 'text' | 'email';
  isSaving?: boolean;
  errorMessage?: string | null;
  onEdit?: () => void;
  onCancel?: () => void;
  onDraftChange?: (value: string) => void;
  onCurrentPasswordChange?: (value: string) => void;
  onSave?: () => void;
}

function formatMemberSince(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return 'U';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function ActionButton({
  actionLabel = 'Edit',
  onClick,
  disabled = false,
}: {
  actionLabel?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-border bg-primary/10 px-4 py-2 text-sm text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60 sm:self-center"
    >
      <Pencil className="h-4 w-4" />
      <span>{actionLabel}</span>
    </button>
  );
}

function CancelButton({ onClick, disabled = false }: { onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center self-start rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
    >
      Cancel
    </button>
  );
}

function SaveButton({ onClick, disabled = false, isSaving = false }: {
  onClick?: () => void;
  disabled?: boolean;
  isSaving?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center self-start rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isSaving ? 'Saving...' : 'Save'}
    </button>
  );
}

function DetailRow({
  icon,
  label,
  value,
  actionLabel = 'Edit',
  requiresPassword = false,
  isEditing = false,
  draftValue = '',
  currentPassword = '',
  inputType = 'text',
  isSaving = false,
  errorMessage,
  onEdit,
  onCancel,
  onDraftChange,
  onCurrentPasswordChange,
  onSave,
}: DetailRowProps) {
  const saveDisabled = isSaving || !draftValue.trim() || (requiresPassword && !currentPassword);

  return (
    <div
      className={`flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:justify-between ${
        isEditing ? 'sm:items-start' : 'sm:items-center'
      }`}
    >
      <div className={`flex flex-1 gap-4 ${isEditing ? 'items-start' : 'items-center'}`}>
        <div className="flex h-11 w-11 shrink-0 self-start items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          {!isEditing && <p className="mt-2 text-base text-foreground break-words">{value}</p>}

          {isEditing && (
            <div className="mt-2 space-y-2.5">
              <input
                type={inputType}
                value={draftValue}
                onChange={(event) => onDraftChange?.(event.target.value)}
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary"
              />
              {requiresPassword && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Enter your password to confirm this email change.
                  </p>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => onCurrentPasswordChange?.(event.target.value)}
                    placeholder="Password"
                    className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary"
                  />
                </div>
              )}
              {errorMessage && (
                <p className="text-sm text-destructive">{errorMessage}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <SaveButton onClick={onSave} disabled={saveDisabled} isSaving={isSaving} />
                <CancelButton onClick={onCancel} disabled={isSaving} />
              </div>
            </div>
          )}
        </div>
      </div>

      {!isEditing && <ActionButton actionLabel={actionLabel} onClick={onEdit} />}
    </div>
  );
}

export function ProfilePanel({ user, onUserChange }: ProfilePanelProps) {
  const [activeField, setActiveField] = useState<'name' | 'email' | null>(null);
  const [nameDraft, setNameDraft] = useState(user.name);
  const [emailDraft, setEmailDraft] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setNameDraft(user.name);
    setEmailDraft(user.email);
  }, [user.email, user.name]);

  const initials = getInitials(user.name);
  const memberSince = formatMemberSince(user.createdAt);

  const openEditor = (field: 'name' | 'email') => {
    setActiveField(field);
    setCurrentPassword('');
    setErrorMessage(null);
    setStatusMessage(null);
    setNameDraft(user.name);
    setEmailDraft(user.email);
  };

  const closeEditor = () => {
    setActiveField(null);
    setCurrentPassword('');
    setErrorMessage(null);
  };

  const saveField = async () => {
    if (!activeField) return;

    const endpoint = activeField === 'name' ? '/api/auth/name' : '/api/auth/email';
    const body = activeField === 'name'
      ? { name: nameDraft }
      : { email: emailDraft, currentPassword };

    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        user?: AuthUser;
      };

      if (!response.ok || !data.user) {
        throw new Error(data.message ?? `Request failed with status ${response.status}`);
      }

      setUser(data.user);
      onUserChange(data.user);
      setStatusMessage(data.message ?? 'Profile updated successfully.');
      closeEditor();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="max-w-4xl">
      <div>
        <div className="mb-6">
          <h1 className="text-foreground mb-1">Profile</h1>
          <p className="text-muted-foreground">
            Manage your personal information.
          </p>
        </div>

        <div className="space-y-5">
          <div className="bg-card rounded-xl border border-border p-6 hover:bg-accent/10 transition-colors">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 text-3xl font-medium text-primary">
                {initials}
              </div>

              <div>
                <h2 className="text-foreground text-2xl">{user.name}</h2>
                <p className="mt-1 text-base text-muted-foreground">{user.email}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Member since {memberSince}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 hover:bg-accent/10 transition-colors">
            <p className="mb-5 text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
              Account Information
            </p>

            {statusMessage && (
              <div className="mb-5 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
                {statusMessage}
              </div>
            )}

            <div className="divide-y divide-border">
              <DetailRow
                icon={<UserRound className="h-5 w-5" />}
                label="Full Name"
                value={user.name}
                actionLabel="Edit"
                requiresPassword={false}
                isEditing={activeField === 'name'}
                draftValue={nameDraft}
                currentPassword={currentPassword}
                inputType="text"
                isSaving={isSaving}
                errorMessage={activeField === 'name' ? errorMessage : null}
                onEdit={() => openEditor('name')}
                onCancel={closeEditor}
                onDraftChange={setNameDraft}
                onCurrentPasswordChange={setCurrentPassword}
                onSave={() => void saveField()}
              />
              <DetailRow
                icon={<Mail className="h-5 w-5" />}
                label="Email Address"
                value={user.email}
                actionLabel="Edit"
                requiresPassword={true}
                isEditing={activeField === 'email'}
                draftValue={emailDraft}
                currentPassword={currentPassword}
                inputType="email"
                isSaving={isSaving}
                errorMessage={activeField === 'email' ? errorMessage : null}
                onEdit={() => openEditor('email')}
                onCancel={closeEditor}
                onDraftChange={setEmailDraft}
                onCurrentPasswordChange={setCurrentPassword}
                onSave={() => void saveField()}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
