import type { DateDisplayOptions } from '@mathesar/api/rest/types/tables/columns';
import {
  DateTimeFormatter,
  DateTimeSpecification,
} from '@mathesar/utils/date-time';
import { isDefinedNonNullable } from '@mathesar-component-library';
import type { ComponentAndProps } from '@mathesar-component-library/types';

import DateTimeCell from './components/date-time/DateTimeCell.svelte';
import DateTimeInput from './components/date-time/DateTimeInput.svelte';
import type { DateTimeCellExternalProps } from './components/typeDefinitions';
import type { CellColumnLike, CellComponentFactory } from './typeDefinitions';

export interface DateLikeColumn extends CellColumnLike {
  display_options: Partial<DateDisplayOptions> | null;
}

function getProps(column: DateLikeColumn): DateTimeCellExternalProps {
  const displayOptions = column.display_options ?? {};
  const format = displayOptions.format ?? 'none';
  const specification = new DateTimeSpecification({
    type: 'date',
    dateFormat: format,
  });
  const formatter = new DateTimeFormatter(specification);
  return {
    type: 'date',
    formattingString: specification.getFormattingString(),
    formatter,
    formatForDisplay: (
      v: string | null | undefined,
    ): string | null | undefined => {
      if (!isDefinedNonNullable(v)) {
        return v;
      }
      return formatter.parseAndFormat(v);
    },
  };
}

const stringType: CellComponentFactory = {
  get: (
    column: DateLikeColumn,
  ): ComponentAndProps<DateTimeCellExternalProps> => ({
    component: DateTimeCell,
    props: getProps(column),
  }),
  getInput: (
    column: DateLikeColumn,
  ): ComponentAndProps<
    Omit<DateTimeCellExternalProps, 'formatForDisplay'>
  > => ({
    component: DateTimeInput,
    props: {
      ...getProps(column),
      allowRelativePresets: true,
    },
  }),
  getDisplayFormatter(column: DateLikeColumn) {
    return (v) => getProps(column).formatForDisplay(String(v));
  },
};

export default stringType;
