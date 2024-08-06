import Cookies from 'js-cookie';

import { buildRpcApi } from '@mathesar/packages/json-rpc-client-builder';

import { columns } from './columns';
import { configured_roles } from './configured_roles';
import { constraints } from './constraints';
import { database_setup } from './database_setup';
import { databases } from './databases';
import { records } from './records';
import { schemas } from './schemas';
import { servers } from './servers';
import { tables } from './tables';

/** Mathesar's JSON-RPC API */
export const api = buildRpcApi({
  endpoint: '/api/rpc/v0/',
  getHeaders: () => ({ 'X-CSRFToken': Cookies.get('csrftoken') }),
  methodTree: {
    configured_roles,
    database_setup,
    databases,
    records,
    schemas,
    servers,
    tables,
    columns,
    constraints,
  },
});
