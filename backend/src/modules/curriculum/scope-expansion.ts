/**
 * Lets the institute curriculum scope (academic/curriculum-scope.routes.ts) be read as "these nodes and everything
 * below them", which is how a scope set on a class or exam matches books tagged on its subjects and chapters.
 * Available only with curriculum v2 on; otherwise the scope is returned as stored.
 */
import { env } from '../../config/env.js';
import { isTaxonomyConfigured, taxonomyDb } from '../taxonomy/client.js';
import { CurriculumService } from './service.js';

export const scopeExpansionAvailable = (): boolean => env.TAXONOMY_V2_ENABLED && isTaxonomyConfigured();

export const expandScope = (ids: string[]): Promise<string[]> => new CurriculumService(taxonomyDb()).withDescendants(ids);
