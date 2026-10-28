import { workspaceRequest, type WorkspacePage } from './workspace';
export interface FactInput {
  subject: string;
  attribute: string;
  value: string;
  /** Human-readable origin, e.g. the user's explicit request. */
  source: string;
  channel: 'desktop' | 'mcp' | 'chat' | 'import';
}
export interface PersonalFact extends FactInput {
  id: string; kind: 'personal_fact'; key: string;
  revision: number; created_ms: number; updated_ms: number;
}
export type FactPage = WorkspacePage<PersonalFact> & { kind: 'personal_fact' };
export interface FactQuery { query?: string; offset?: number; limit?: number }
export interface MemoryService {
  remember(input: FactInput): Promise<PersonalFact>;
  search(options?: FactQuery): Promise<FactPage>;
  /** Call before or alongside activity search; results are explicit facts, not activity evidence. */
  recall(query: string, limit?: number): Promise<FactPage>;
  update(fact: PersonalFact, input: FactInput): Promise<PersonalFact>;
  delete(fact: PersonalFact): Promise<{ id: string; deleted: true; deleted_ms: number }>;
}
export type MemoryTransport = <T>(operation: string, body: unknown) => Promise<T>;
export function createMemoryService(request: MemoryTransport = workspaceRequest): MemoryService {
  return {
    remember: input => request('remember_fact', input),
    search: (options = {}) => request('facts', options),
    recall: (query, limit = 20) => request('recall_facts', { query, limit }),
    update: (fact, input) => request('update_fact', { ...input, fact_id: fact.id, expected_revision: fact.revision }),
    delete: fact => request('delete_fact', { fact_id: fact.id, expected_revision: fact.revision }),
  };
}
export const memoryService = createMemoryService();
