import { type Readable, derived, writable } from 'svelte/store';

import {
  type RequestStatus,
  getAPI,
  patchAPI,
} from '@mathesar/api/rest/utils/requestUtils';
import type { RecordsResponse } from '@mathesar/api/rpc/records';
import type { Table } from '@mathesar/api/rpc/tables';
import { WritableMap } from '@mathesar/component-library';
import RecordSummaryStore from '@mathesar/stores/table-data/record-summaries/RecordSummaryStore';
import {
  buildRecordSummariesForSheet,
  prepareFieldsAsRecordSummaryInputData,
  renderTransitiveRecordSummary,
} from '@mathesar/stores/table-data/record-summaries/recordSummaryUtils';
import { getErrorMessage } from '@mathesar/utils/errors';

export default class RecordStore {
  fetchRequest = writable<RequestStatus | undefined>(undefined);

  /** Keys are column ids */
  fieldValues = new WritableMap<number, unknown>();

  recordSummaries = new RecordSummaryStore();

  summary: Readable<string>;

  table: Table;

  recordPk: string;

  private url: string;

  constructor({ table, recordPk }: { table: Table; recordPk: string }) {
    this.table = table;
    this.recordPk = recordPk;
    this.url = `/api/db/v0/tables/${this.table.oid}/records/${this.recordPk}/`;
    // TODO_RS_TEMPLATE
    //
    // We need to handle the case where no record summary template is set.
    // Previously it was the responsibility of the service layer to _always_
    // return a record summary template, even by deriving one on the fly to send
    // if necessary. With the changes for beta, it will be the responsibility of
    // the client to handle the case where no template is set. We need to wait
    // until after the service layer changes are made before we can implement
    // this here.
    const template =
      this.table.metadata?.record_summary_template ?? 'TODO_RS_TEMPLATE';
    this.summary = derived(
      [this.fieldValues, this.recordSummaries],
      ([fields, fkSummaryData]) =>
        renderTransitiveRecordSummary({
          template,
          inputData: prepareFieldsAsRecordSummaryInputData(fields),
          transitiveData: fkSummaryData,
        }),
    );
    void this.fetch();
  }

  private updateSelfWithApiResponseData(response: RecordsResponse): void {
    const result = response.results[0];
    this.fieldValues.reconstruct(
      Object.entries(result).map(([k, v]) => [parseInt(k, 10), v]),
    );
    if (response.preview_data) {
      this.recordSummaries.setFetchedSummaries(
        buildRecordSummariesForSheet(response.preview_data),
      );
    }
  }

  async fetch(): Promise<void> {
    this.fetchRequest.set({ state: 'processing' });
    try {
      this.updateSelfWithApiResponseData(await getAPI(this.url));
      this.fetchRequest.set({ state: 'success' });
    } catch (error) {
      this.fetchRequest.set({
        state: 'failure',
        errors: [getErrorMessage(error)],
      });
    }
  }

  async patch(payload: Record<string, unknown>) {
    this.updateSelfWithApiResponseData(await patchAPI(this.url, payload));
  }
}
