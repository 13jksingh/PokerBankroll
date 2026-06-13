/** Runtime configuration resolved from build-time env and the URL. */

export interface AppConfig {
  apiUrl: string;
  /** Pre-selected table id from the ?table= query param, if any. */
  initialTableId: string | null;
}

export function getConfig(): AppConfig {
  const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
  let initialTableId: string | null = null;
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    initialTableId = params.get('table');
  }
  return { apiUrl, initialTableId };
}

export function isConfigured(config: AppConfig): boolean {
  return Boolean(config.apiUrl) && config.apiUrl.includes('/exec');
}
