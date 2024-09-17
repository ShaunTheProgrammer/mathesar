/**
 * @file
 *
 * TODO This file should ideally be refactored, cleaned up, and made to function
 * more consistently with the rest of the codebase.
 *
 * Also, tables need to be sorted before being stored, but that sorting happens
 * in many different places. I suggest having a derived store that does the
 * sorting.
 */

import { execPipe, filter, find, map } from 'iter-tools';
import {
  type Readable,
  type Writable,
  derived,
  get,
  readable,
  writable,
} from 'svelte/store';
import { _ } from 'svelte-i18n';

import type { DataFile } from '@mathesar/api/rest/types/dataFiles';
import type { RequestStatus } from '@mathesar/api/rest/utils/requestUtils';
import { api } from '@mathesar/api/rpc';
import type { ColumnPatchSpec } from '@mathesar/api/rpc/columns';
import type { Table } from '@mathesar/api/rpc/tables';
import { invalidIf } from '@mathesar/components/form';
import type { Database } from '@mathesar/models/Database';
import type { Schema } from '@mathesar/models/Schema';
import {
  type RpcRequest,
  batchSend,
} from '@mathesar/packages/json-rpc-client-builder';
import { TupleMap } from '@mathesar/packages/tuple-map';
import { preloadCommonData } from '@mathesar/utils/preloadData';
import {
  mergeTables,
  tableRequiresImportConfirmation,
} from '@mathesar/utils/tables';
import {
  CancellablePromise,
  type RecursivePartial,
  collapse,
  defined,
} from '@mathesar-component-library';

import { currentDatabase } from './databases';
import { currentSchemaId } from './schemas';

const commonData = preloadCommonData();

type TablesMap = Map<Table['oid'], Table>;

interface TablesData {
  tablesMap: TablesMap;
  requestStatus: RequestStatus;
}

function makeEmptyTablesData(): TablesData {
  return {
    tablesMap: new Map(),
    requestStatus: { state: 'success' },
  };
}

type TablesStore = Writable<TablesData>;

/** Maps [databaseId, schemaOid] to TablesStore */
const tablesStores = new TupleMap<
  [Database['id'], Schema['oid']],
  TablesStore
>();

const tablesRequests = new TupleMap<
  [Database['id'], Schema['oid']],
  CancellablePromise<Table[]>
>();

function sortTables(tables: Iterable<Table>): Table[] {
  return [...tables].sort((a, b) => a.name.localeCompare(b.name));
}

function setTablesStore(
  database: Pick<Database, 'id'>,
  schema: Pick<Schema, 'oid'>,
  tables?: Table[],
): TablesStore {
  const tablesMap: TablesMap = new Map();
  if (tables) {
    sortTables(tables).forEach((t) => tablesMap.set(t.oid, t));
  }

  const storeValue: TablesData = {
    tablesMap,
    requestStatus: { state: 'success' },
  };

  let store = tablesStores.get([database.id, schema.oid]);
  if (!store) {
    store = writable(storeValue);
    tablesStores.set([database.id, schema.oid], store);
  } else {
    store.set(storeValue);
  }
  return store;
}

export function removeTablesStore(
  database: Pick<Database, 'id'>,
  schema: Pick<Schema, 'oid'>,
): void {
  tablesStores.delete([database.id, schema.oid]);
}

export async function refetchTablesForSchema(
  database: Pick<Database, 'id'>,
  schema: Pick<Schema, 'oid'>,
): Promise<TablesData | undefined> {
  const store = tablesStores.get([database.id, schema.oid]);
  if (!store) {
    // TODO: why are we logging an error here? I would expect that we'd either
    // throw or ignore. If there's a reason for this logging, please add a code
    // comment explaining why.
    console.error('Tables store not found.');
    return undefined;
  }

  try {
    store.update((currentData) => ({
      ...currentData,
      requestStatus: { state: 'processing' },
    }));

    tablesRequests.get([database.id, schema.oid])?.cancel();

    const tablesRequest = api.tables
      .list_with_metadata({
        database_id: database.id,
        schema_oid: schema.oid,
      })
      .run();
    tablesRequests.set([database.id, schema.oid], tablesRequest);
    const tableEntries = await tablesRequest;

    const schemaTablesStore = setTablesStore(database, schema, tableEntries);

    return get(schemaTablesStore);
  } catch (err) {
    store.update((currentData) => ({
      ...currentData,
      requestStatus: {
        state: 'failure',
        errors: [
          err instanceof Error ? err.message : 'Error in fetching schemas',
        ],
      },
    }));
    return undefined;
  }
}

let preload = true;

function getTablesStore(
  database: Pick<Database, 'id'>,
  schema: Pick<Schema, 'oid'>,
): TablesStore {
  let store = tablesStores.get([database.id, schema.oid]);
  if (!store) {
    store = writable({
      requestStatus: { state: 'processing' },
      tablesMap: new Map(),
    });
    tablesStores.set([database.id, schema.oid], store);
    if (
      preload &&
      commonData.current_schema === schema.oid &&
      commonData.current_database === database.id
    ) {
      store = setTablesStore(database, schema, commonData.tables ?? []);
    } else {
      void refetchTablesForSchema(database, schema);
    }
    preload = false;
  } else if (get(store).requestStatus.state === 'failure') {
    void refetchTablesForSchema(database, schema);
  }
  return store;
}

function findStoreContainingTable(
  database: Pick<Database, 'id'>,
  tableOid: Table['oid'],
): TablesStore | undefined {
  return defined(
    find(
      ([[databaseId], tablesStore]) =>
        databaseId === database.id && get(tablesStore).tablesMap.has(tableOid),
      tablesStores,
    ),
    ([, tablesStore]) => tablesStore,
  );
}

export function deleteTable(
  schema: Schema,
  tableOid: Table['oid'],
): CancellablePromise<void> {
  const promise = api.tables
    .delete({
      database_id: schema.database.id,
      table_oid: tableOid,
    })
    .run();
  return new CancellablePromise(
    (resolve, reject) => {
      void promise.then(() => {
        schema.updateTableCount(get(schema.tableCount) - 1);
        tablesStores
          .get([schema.database.id, schema.oid])
          ?.update((tableStoreData) => {
            tableStoreData.tablesMap.delete(tableOid);
            return {
              ...tableStoreData,
              tablesMap: new Map(tableStoreData.tablesMap),
            };
          });
        return resolve();
      }, reject);
    },
    () => {
      promise.cancel();
    },
  );
}

/**
 * @throws Error if the table store is not found or if the table is not found in
 * the store.
 */
export async function updateTable({
  database,
  table,
  columnPatchSpecs,
  columnsToDelete,
}: {
  database: Pick<Database, 'id'>;
  table: RecursivePartial<Table> & { oid: Table['oid'] };
  columnPatchSpecs?: ColumnPatchSpec[];
  columnsToDelete?: number[];
}): Promise<Table> {
  const requests: RpcRequest<void>[] = [];
  if (table.name || table.description) {
    requests.push(
      api.tables.patch({
        database_id: database.id,
        table_oid: table.oid,
        table_data_dict: {
          name: table.name,
          description: table.description,
        },
      }),
    );
  }
  if (columnPatchSpecs) {
    requests.push(
      api.columns.patch({
        database_id: database.id,
        table_oid: table.oid,
        column_data_list: columnPatchSpecs,
      }),
    );
  }
  if (table.metadata) {
    requests.push(
      api.tables.metadata.set({
        database_id: database.id,
        table_oid: table.oid,
        metadata: table.metadata,
      }),
    );
  }
  if (columnsToDelete?.length) {
    requests.push(
      api.columns.delete({
        database_id: database.id,
        table_oid: table.oid,
        column_attnums: columnsToDelete,
      }),
    );
  }
  await batchSend(requests);

  let newTable: Table | undefined;
  const tableStore = findStoreContainingTable(database, table.oid);
  if (!tableStore) throw new Error('Table store not found');
  tableStore.update((tablesData) => {
    const oldTable = tablesData.tablesMap.get(table.oid);
    if (!oldTable) throw new Error('Table not found within store.');
    newTable = mergeTables(oldTable, table);
    tablesData.tablesMap.set(table.oid, newTable);
    const tablesMap: TablesMap = new Map();
    sortTables([...tablesData.tablesMap.values()]).forEach((t) => {
      tablesMap.set(t.oid, t);
    });
    return { ...tablesData, tablesMap };
  });
  if (!newTable) throw new Error('Table not updated.');
  return newTable;
}

function addTableToStore({
  schema,
  table,
}: {
  schema: Schema;
  table: Partial<Table> & Pick<Table, 'oid' | 'name'>;
}): Table {
  schema.updateTableCount(get(schema.tableCount) + 1);
  const fullTable: Table = {
    description: null,
    metadata: null,
    schema: schema.oid,
    ...table,
  };
  const tablesStore = tablesStores.get([schema.database.id, schema.oid]);
  tablesStore?.update((tablesData) => {
    const tables = sortTables([...tablesData.tablesMap.values(), fullTable]);
    return {
      ...tablesData,
      tablesMap: new Map(tables.map((t) => [t.oid, t])),
    };
  });
  return fullTable;
}

export function createTable({
  schema,
}: {
  schema: Schema;
}): CancellablePromise<Table> {
  const promise = api.tables
    .add({
      database_id: schema.database.id,
      schema_oid: schema.oid,
    })
    .run();
  return new CancellablePromise(
    (resolve, reject) => {
      void promise.then(
        (table) => resolve(addTableToStore({ schema, table })),
        reject,
      );
    },
    () => {
      promise.cancel();
    },
  );
}

export async function createTableFromDataFile(props: {
  schema: Schema;
  dataFile: Pick<DataFile, 'id'>;
  name?: string;
}): Promise<Table> {
  const created = await api.tables
    .import({
      database_id: props.schema.database.id,
      schema_oid: props.schema.oid,
      table_name: props.name,
      data_file_id: props.dataFile.id,
    })
    .run();

  const basicTable = addTableToStore({
    schema: props.schema,
    table: {
      oid: created.oid,
      name: created.name,
      schema: props.schema.oid,
    },
  });

  const fullTable = await updateTable({
    database: props.schema.database,
    table: {
      ...basicTable,
      metadata: {
        import_verified: false,
        data_file_id: props.dataFile.id,
      },
    },
  });
  return fullTable;
}

export function getTableFromStoreOrApi({
  database,
  tableOid,
}: {
  database: Pick<Database, 'id'>;
  tableOid: Table['oid'];
}): CancellablePromise<Table> {
  const tablesStore = findStoreContainingTable(database, tableOid);
  if (tablesStore) {
    const table = get(tablesStore).tablesMap.get(tableOid);
    if (table) {
      return new CancellablePromise((resolve) => {
        resolve(table);
      });
    }
  }
  const promise = api.tables
    .get_with_metadata({
      database_id: database.id,
      table_oid: tableOid,
    })
    .run();
  return new CancellablePromise(
    (resolve, reject) => {
      void promise.then((table) => {
        const store = tablesStores.get([database.id, table.schema]);
        if (store) {
          store.update((existing) => {
            const tableMap = new Map<number, Table>();
            const tables = [...existing.tablesMap.values(), table];
            sortTables(tables).forEach((t) => {
              tableMap.set(t.oid, t);
            });
            return {
              ...existing,
              tablesMap: tableMap,
            };
          });
        }
        return resolve(table);
      }, reject);
    },
    () => {
      promise.cancel();
    },
  );
}

export const currentTablesData = collapse(
  derived([currentDatabase, currentSchemaId], ([database, schemaOid]) =>
    !database || !schemaOid
      ? readable(makeEmptyTablesData())
      : getTablesStore(database, { oid: schemaOid }),
  ),
);

export const currentTablesMap = derived(
  currentTablesData,
  (tablesData) => tablesData.tablesMap,
);

export const currentTables = derived(currentTablesData, (tablesData) =>
  sortTables(tablesData.tablesMap.values()),
);

export const importVerifiedTables: Readable<TablesMap> = derived(
  currentTablesData,
  (tablesData) =>
    new Map(
      [...tablesData.tablesMap.values()]
        .filter((table) => !tableRequiresImportConfirmation(table))
        .map((table) => [table.oid, table]),
    ),
);

export const validateNewTableName = derived(currentTablesData, (tablesData) => {
  const names = new Set([...tablesData.tablesMap.values()].map((t) => t.name));
  return invalidIf(
    (name: string) => names.has(name),
    'A table with that name already exists.',
  );
});

export const currentTableId = writable<number | undefined>(undefined);

export const currentTable = derived(
  [currentTableId, currentTablesData],
  ([$currentTableId, $tables]) =>
    $currentTableId === undefined
      ? undefined
      : $tables.tablesMap.get($currentTableId),
);

export async function refetchTablesForCurrentSchema() {
  const database = get(currentDatabase);
  const schemaOid = get(currentSchemaId);
  if (schemaOid) {
    await refetchTablesForSchema(database, { oid: schemaOid });
  }
}

export function factoryToGetTableNameValidationErrors(
  database: Pick<Database, 'id'>,
  table: Table,
): Readable<(n: string) => string[]> {
  const tablesStore = tablesStores.get([database.id, table.schema]);
  if (!tablesStore) throw new Error('Tables store not found');

  const otherTableNames = derived(
    tablesStore,
    (d) =>
      new Set(
        execPipe(
          d.tablesMap.values(),
          filter((t) => t.oid !== table.oid),
          map((t) => t.name),
        ),
      ),
  );

  return derived([otherTableNames, _], ([$otherTableNames, $_]) => {
    function getNameValidationErrors(name: string): string[] {
      if (!name.trim()) {
        return [$_('table_name_cannot_be_empty')];
      }
      if ($otherTableNames.has(name)) {
        return [$_('table_with_name_already_exists')];
      }
      return [];
    }

    return getNameValidationErrors;
  });
}
