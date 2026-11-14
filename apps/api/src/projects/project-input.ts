import { invalid, preconditionRequired } from '../common/api-error';

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function projectId(id: string): string {
  if (!UUID_PATTERN.test(id)) throw invalid('Project id must be a UUID.', 'id');
  return id.toLowerCase();
}

export function projectName(value: unknown): string {
  if (typeof value !== 'string') throw invalid('A project name is required.', 'name');
  const name = value.trim();
  if (!name || Array.from(name).length > 100 || /\p{Cc}/u.test(name)) {
    throw invalid('Project name must contain 1 to 100 characters and no control characters.', 'name');
  }
  return name;
}

export function revisionHeader(value: string | undefined, required: true): number;
export function revisionHeader(value: string | undefined, required: false): number | undefined;
export function revisionHeader(value: string | undefined, required: boolean): number | undefined {
  if (value === undefined) {
    if (required) throw preconditionRequired();
    return undefined;
  }
  if (!/^"[1-9][0-9]*"$/.test(value)) {
    throw invalid('If-Match must be a single quoted revision, such as "1".', 'If-Match');
  }
  const revision = Number(value.slice(1, -1));
  if (!Number.isSafeInteger(revision)) throw invalid('Invalid revision in If-Match.', 'If-Match');
  return revision;
}
