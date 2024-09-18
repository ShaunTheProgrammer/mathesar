import { rpcMethodTypeContainer } from '@mathesar/packages/json-rpc-client-builder';

interface Referent {
  referent_table: number;
  column_name: string;
}

interface OneToAny {
  reference_table: number;
  reference_column_name: string;
  referent_table: number;
}

export interface OneToOne extends OneToAny {
  link_type: 'one-to-one';
}
export interface OneToMany extends OneToAny {
  link_type: 'one-to-many';
}

export interface ManyToMany {
  link_type: 'many-to-many';
  mapping_table_name: string;
  referents: Referent[];
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const data_modeling = {
  /**
   * Returns a record where keys are stringified column attnums and values are
   * postgresql types
   */
  suggest_types: rpcMethodTypeContainer<
    {
      database_id: number;
      table_oid: number;
    },
    Record<string, string>
  >(),

  add_foreign_key_column: rpcMethodTypeContainer<
    {
      database_id: number;
      /** The OID of the table getting the new column. */
      referrer_table_oid: number;
      /** The OID of the table being referenced. */
      referent_table_oid: number;
      /** The name of the column to create. */
      column_name: string;
    },
    void
  >(),

  add_mapping_table: rpcMethodTypeContainer<
    {
      database_id: number;
      schema_oid: number;
      /** The name for the new mapping table. */
      table_name: string;
      mapping_columns: {
        column_name: string;
        referent_table_oid: number;
      }[];
    },
    void
  >(),
};
