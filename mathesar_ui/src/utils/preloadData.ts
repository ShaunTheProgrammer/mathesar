import type { QueryInstance } from '@mathesar/api/rest/types/queries';
import type { User } from '@mathesar/api/rest/users';
import type { DatabaseResponse } from '@mathesar/api/rpc/databases';
import type { Schema } from '@mathesar/api/rpc/schemas';
import type { Server } from '@mathesar/api/rpc/servers';
import type { Table } from '@mathesar/api/rpc/tables';
import type { AbstractTypeResponse } from '@mathesar/AppTypes';

export interface CommonData {
  databases: DatabaseResponse[];
  servers: Server[];
  schemas: Schema[];
  tables: Table[];
  queries: QueryInstance[];
  current_database: DatabaseResponse['id'] | null;
  internal_db_connection: {
    database: string;
    host: string;
    port: number;
    type: string;
    user: string;
  };
  current_schema: number | null;
  abstract_types: AbstractTypeResponse[];
  user: User;
  current_release_tag_name: string;
  supported_languages: Record<string, string>;
  is_authenticated: boolean;
  routing_context: 'normal' | 'anonymous';
}

function getData<T>(selector: string): T | undefined {
  const preloadedData = document.querySelector<Element>(selector);
  if (!preloadedData?.textContent) {
    return undefined;
  }
  try {
    const data = JSON.parse(preloadedData.textContent) as T;
    return data;
  } catch (err) {
    console.error(err);
  }
  return undefined;
}

export function preloadRouteData<T>(routeName: string): T | undefined {
  return getData<T>(`#${routeName}`);
}

export function preloadCommonData(): CommonData {
  const commonData = getData<CommonData>('#common-data');
  if (!commonData) {
    throw new Error('commonData is undefined. This state should never occur');
  }
  return commonData;
}
