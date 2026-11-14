export interface Project {
  id: string;
  name: string;
  revision: number;
  format: 'openblock';
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectContent {
  project: Project;
  archive: Buffer;
}

/** Compare the expected revision and commit each mutation atomically. */
export interface ProjectStore {
  list(): Promise<Project[]>;
  read(id: string): Promise<Project>;
  readContent(id: string, expectedRevision?: number): Promise<ProjectContent>;
  create(name: string, archive: Buffer): Promise<Project>;
  rename(id: string, expectedRevision: number, name: string): Promise<Project>;
  replaceContent(id: string, expectedRevision: number, archive: Buffer): Promise<Project>;
  delete(id: string, expectedRevision: number): Promise<void>;
}

export const PROJECT_STORE = Symbol('PROJECT_STORE');
