/**
 * Selects the upload protocol without changing the established ML_URL contract.
 *
 * The default remains the original synchronous `POST /` protocol used by the
 * hosted Colab/ngrok service. Local CPU deployments explicitly opt into the
 * durable job protocol because they expose `/jobs` status endpoints.
 */
export function isLocalCpuJobsEnabled(): boolean {
    return process.env.AUTODOCS_PROCESSING_MODE === 'local-cpu-jobs';
}
