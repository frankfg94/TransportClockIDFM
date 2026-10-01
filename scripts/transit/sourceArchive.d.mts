export type SourceVersion = { sourceEtag?: string; sourceLastModified?: string };
export type SourceDownload = { status: 'unchanged' } | {
  status: 'downloaded'; sha256: string; bytes: number; etag?: string; lastModified?: string;
};
export function downloadSourceArchive(options: {
  url: string; archivePath: string; previous?: SourceVersion; reindex?: boolean;
  maxBytes?: number; progress?: (bytes: number, total?: number) => void;
  fetchSource?: typeof fetch;
}): Promise<SourceDownload>;
