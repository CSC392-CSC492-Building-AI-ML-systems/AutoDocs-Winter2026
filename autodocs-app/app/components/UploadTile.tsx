"use client";

import { IconAlertTriangle, IconCheck, IconCloudUpload, IconLoader2 } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadProgressPanel } from '@/app/components/UploadProgressPanel';
import type { MlJobStatus } from '@/app/lib/server/ml-jobs';

type UploadState = 'idle' | 'registering' | 'processing' | 'success' | 'error';

interface LegacyUploadResponse {
    terminalSession?: { id: string };
    message?: string;
}

interface JobAvailabilityResponse {
    enabled?: boolean;
    job?: MlJobStatus | null;
}

interface UploadTileProperties {
    onUploadSuccess?: () => void;
}

/** Uploads recordings through the configured legacy or local-CPU protocol. */
export function UploadTile({ onUploadSuccess }: UploadTileProperties) {
    const [isDragging, setIsDragging] = useState(false);
    const [uploadState, setUploadState] = useState<UploadState>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [job, setJob] = useState<MlJobStatus | null>(null);
    const [isLocalCpuJobsEnabled, setIsLocalCpuJobsEnabled] = useState(false);
    const [isProcessingModeResolved, setIsProcessingModeResolved] = useState(false);
    const fileInputReference = useRef<HTMLInputElement>(null);
    const notifiedJobReference = useRef<string | null>(null);

    const pollJob = useCallback(async (jobId: string): Promise<void> => {
        const response = await fetch(`/api/terminal-session-jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(body.message ?? `Progress check failed with status ${response.status}`);
        }

        const nextJob = body.job as MlJobStatus;
        setJob(nextJob);

        if (nextJob.status === 'failed') {
            setErrorMessage(nextJob.error ?? 'Analysis failed.');
            setUploadState('error');
        }

        if (nextJob.status === 'completed') {
            setUploadState('success');

            if (notifiedJobReference.current !== jobId) {
                notifiedJobReference.current = jobId;
                onUploadSuccess?.();
            }
        }
    }, [onUploadSuccess]);

    useEffect(() => {
        let isDisposed = false;

        const resumeJob = async (): Promise<void> => {
            try {
                const response = await fetch('/api/terminal-session-jobs', { cache: 'no-store' });
                const body = await response.json() as JobAvailabilityResponse;

                if (isDisposed) {
                    return;
                }

                setIsLocalCpuJobsEnabled(body.enabled === true);
                setIsProcessingModeResolved(true);

                if (body.enabled && body.job) {
                    setJob(body.job);
                    setUploadState('processing');
                }
            } catch {
                // Legacy deployments do not require the job status endpoint.
                if (!isDisposed) {
                    setIsProcessingModeResolved(true);
                }
            }
        };

        void resumeJob();

        return () => {
            isDisposed = true;
        };
    }, []);

    useEffect(() => {
        if (!job || ['completed', 'failed'].includes(job.status)) {
            return;
        }

        const timer = setInterval(() => {
            void pollJob(job.id).catch((error: unknown) => {
                setErrorMessage(error instanceof Error ? error.message : 'Unable to read upload progress.');
                setUploadState('error');
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [job, pollJob]);

    const validateAndReadFile = async (file: File): Promise<{ title: string; durationSeconds: number; content: string }> => {
        if (file.name.split('.').pop()?.toLowerCase() !== 'cast') {
            throw new Error('Unsupported file type. Please upload a .cast file.');
        }

        const content = await file.text();
        const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);

        if (lines.length < 2) {
            throw new Error('Invalid .cast file format.');
        }

        const lastEvent = JSON.parse(lines.at(-1) ?? '');

        if (!Array.isArray(lastEvent) || typeof lastEvent[0] !== 'number') {
            throw new Error('Failed to parse duration from .cast file.');
        }

        return {
            title: file.name.replace(/\.[^/.]+$/, ''),
            durationSeconds: Math.round(lastEvent[0]),
            content,
        };
    };

    const uploadThroughLegacyEndpoint = async (input: { title: string; durationSeconds: number; content: string }): Promise<void> => {
        setUploadState('processing');

        const response = await fetch('/api/terminal-sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });
        const body = await response.json().catch(() => ({})) as LegacyUploadResponse;

        if (!response.ok) {
            throw new Error(body.message ?? `Could not process upload (${response.status}).`);
        }

        setUploadState('success');
        onUploadSuccess?.();
    };

    const uploadThroughLocalCpuJobs = async (input: { title: string; durationSeconds: number; content: string }): Promise<void> => {
        const response = await fetch('/api/terminal-session-jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(body.message ?? `Could not start analysis (${response.status}).`);
        }

        setJob(body.job as MlJobStatus);
        setUploadState('processing');
    };

    const handleFileUpload = async (file: File): Promise<void> => {
        setUploadState('registering');
        setErrorMessage(null);
        setJob(null);

        try {
            const input = await validateAndReadFile(file);

            if (isLocalCpuJobsEnabled) {
                await uploadThroughLocalCpuJobs(input);
            } else {
                await uploadThroughLegacyEndpoint(input);
            }
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Upload failed.');
            setUploadState('error');
        }
    };

    const isBusy = !isProcessingModeResolved || ['registering', 'processing'].includes(uploadState);
    const isLocalJob = isLocalCpuJobsEnabled && uploadState === 'processing';
    const title = !isProcessingModeResolved
        ? 'Checking upload configuration…'
        : uploadState === 'registering'
        ? 'Preparing upload…'
        : uploadState === 'processing'
            ? isLocalJob ? 'Analysis continues in the background' : 'Processing upload…'
            : uploadState === 'success'
                ? 'Session saved'
                : uploadState === 'error'
                    ? 'Upload failed'
                    : 'Upload Session';
    const subtitle = !isProcessingModeResolved
        ? 'Preparing the configured upload workflow.'
        : uploadState === 'registering'
        ? isLocalCpuJobsEnabled ? 'Saving your upload as a durable analysis job.' : 'Reading your recording.'
        : uploadState === 'processing'
            ? isLocalJob ? 'You can safely keep this page open or reload it; detailed progress is below.' : 'The configured analyzer is processing this recording.'
            : uploadState === 'success'
                ? 'Your annotated session is ready.'
                : uploadState === 'error'
                    ? errorMessage
                    : 'Drop an asciinema .cast recording here or click to browse.';
    const icon = uploadState === 'success'
        ? <IconCheck className="text-emerald-400" size={30} />
        : uploadState === 'error'
            ? <IconAlertTriangle className="text-destructive" size={30} />
            : isBusy
                ? <IconLoader2 className="text-primary animate-spin" size={30} />
                : <IconCloudUpload className="text-primary" size={30} />;

    return (
        <div className="space-y-4">
            <div
                className={`bg-card rounded-xl border-2 border-dashed p-6 transition-all ${isBusy ? 'cursor-wait border-primary/50' : isDragging ? 'cursor-copy border-primary bg-primary/5' : 'cursor-pointer border-border hover:border-primary'}`}
                onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);

                    if (!isBusy && event.dataTransfer.files[0]) {
                        void handleFileUpload(event.dataTransfer.files[0]);
                    }
                }}
                onClick={() => !isBusy && fileInputReference.current?.click()}
            >
                <input
                    ref={fileInputReference}
                    type="file"
                    className="hidden"
                    accept=".cast"
                    onChange={(event) => {
                        const file = event.target.files?.[0];

                        if (file) {
                            void handleFileUpload(file);
                        }

                        event.target.value = '';
                    }}
                />
                <div className="flex flex-col items-center justify-center min-h-[200px]">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">{icon}</div>
                    <h3 className="text-foreground mb-2">{title}</h3>
                    <p className={`text-sm text-center max-w-sm ${uploadState === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>{subtitle}</p>
                    {!isBusy && uploadState !== 'success' && <span className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">Choose .cast file</span>}
                </div>
            </div>
            {job && <UploadProgressPanel job={job} />}
        </div>
    );
}
