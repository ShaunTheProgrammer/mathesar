"""
Classes and functions exposed to the RPC endpoint for managing tables in a database.
"""
from typing import Optional, TypedDict

from modernrpc.core import rpc_method, REQUEST_KEY
from modernrpc.auth.basic import http_basic_auth_login_required

from db.tables.operations.select import get_table_info, get_table
from db.tables.operations.drop import drop_table_from_database
from db.tables.operations.create import create_table_on_database
from db.tables.operations.alter import alter_table_on_database
from db.tables.operations.import_ import import_csv, get_preview
from mathesar.rpc.columns import CreatableColumnInfo, SettableColumnInfo, PreviewableColumnInfo
from mathesar.rpc.constraints import CreatableConstraintInfo
from mathesar.rpc.exceptions.handlers import handle_rpc_exceptions
from mathesar.rpc.utils import connect


class TableInfo(TypedDict):
    """
    Information about a table.

    Attributes:
        oid: The `oid` of the table in the schema.
        name: The name of the table.
        schema: The `oid` of the schema where the table lives.
        description: The description of the table.
    """
    oid: int
    name: str
    schema: int
    description: Optional[str]


class SettableTableInfo(TypedDict):
    """
    Information about a table, restricted to settable fields.

    When possible, Passing `null` for a key will clear the underlying
    setting. E.g.,

    - `description = null` clears the table description.

    Setting any of `name`, `columns` to `null` is a noop.

    Attributes:
        name: The new name of the table.
        description: The description of the table.
        columns: A list describing desired column alterations.
    """
    name: Optional[str]
    description: Optional[str]
    columns: Optional[list[SettableColumnInfo]]


@rpc_method(name="tables.list")
@http_basic_auth_login_required
@handle_rpc_exceptions
def list_(*, schema_oid: int, database_id: int, **kwargs) -> list[TableInfo]:
    """
    List information about tables for a schema. Exposed as `list`.

    Args:
        schema_oid: Identity of the schema in the user's database.
        database_id: The Django id of the database containing the table.

    Returns:
        A list of table details.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        raw_table_info = get_table_info(schema_oid, conn)
    return [
        TableInfo(tab) for tab in raw_table_info
    ]


@rpc_method(name="tables.get")
@http_basic_auth_login_required
@handle_rpc_exceptions
def get(*, table_oid: int, database_id: int, **kwargs) -> TableInfo:
    """
    List information about a table for a schema.

    Args:
        table_oid: Identity of the table in the user's database.
        database_id: The Django id of the database containing the table.

    Returns:
        Table details for a given table oid.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        raw_table_info = get_table(table_oid, conn)
    return TableInfo(raw_table_info)


@rpc_method(name="tables.add")
@http_basic_auth_login_required
@handle_rpc_exceptions
def add(
    *,
    schema_oid: int,
    database_id: int,
    table_name: str = None,
    column_data_list: list[CreatableColumnInfo] = [],
    constraint_data_list: list[CreatableConstraintInfo] = [],
    comment: str = None,
    **kwargs
) -> int:
    """
    Add a table with a default id column.

    Args:
        schema_oid: Identity of the schema in the user's database.
        database_id: The Django id of the database containing the table.
        table_name: Name of the table to be created.
        column_data_list: A list describing columns to be created for the new table, in order.
        constraint_data_list: A list describing constraints to be created for the new table.
        comment: The comment for the new table.

    Returns:
        The `oid` of the created table.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        created_table_oid = create_table_on_database(
            table_name, schema_oid, conn, column_data_list, constraint_data_list, comment
        )
    return created_table_oid


@rpc_method(name="tables.delete")
@http_basic_auth_login_required
@handle_rpc_exceptions
def delete(
    *, table_oid: int, database_id: int, cascade: bool = False, **kwargs
) -> str:
    """
    Delete a table from a schema.

    Args:
        table_oid: Identity of the table in the user's database.
        database_id: The Django id of the database containing the table.
        cascade: Whether to drop the dependent objects.

    Returns:
        The name of the dropped table.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        return drop_table_from_database(table_oid, conn, cascade)


@rpc_method(name="tables.patch")
@http_basic_auth_login_required
@handle_rpc_exceptions
def patch(
    *, table_oid: str, table_data_dict: SettableTableInfo, database_id: int, **kwargs
) -> str:
    """
    Alter details of a preexisting table in a database.

    Args:
        table_oid: Identity of the table whose name, description or columns we'll modify.
        table_data_dict: A list describing desired table alterations.
        database_id: The Django id of the database containing the table.

    Returns:
        The name of the altered table.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        return alter_table_on_database(table_oid, table_data_dict, conn)


@rpc_method(name="tables.import")
@http_basic_auth_login_required
@handle_rpc_exceptions
def import_(
    *,
    data_file_id: int,
    table_name: str,
    schema_oid: int,
    database_id: int,
    comment: str = None,
    **kwargs
) -> int:
    """
    Import a CSV/TSV into a table.

    Args:
        data_file_id: The Django id of the DataFile containing desired CSV/TSV.
        table_name: Name of the table to be imported.
        schema_oid: Identity of the schema in the user's database.
        database_id: The Django id of the database containing the table.
        comment: The comment for the new table.

    Returns:
        The `oid` of the created table.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        return import_csv(data_file_id, table_name, schema_oid, conn, comment)


@rpc_method(name="tables.get_import_preview")
@http_basic_auth_login_required
@handle_rpc_exceptions
def get_import_preview(
    *,
    table_oid: int,
    columns: list[PreviewableColumnInfo],
    database_id: int,
    limit: int = 20,
    **kwargs
) -> list[dict]:
    """
    Preview an imported table.

    Args:
        table_oid: Identity of the imported table in the user's database.
        columns: List of settings describing the casts to be applied to the columns.
        database_id: The Django id of the database containing the table.
        limit: The upper limit for the number of records to return.

    Returns:
        The records from the specified columns of the table.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        return get_preview(table_oid, columns, conn, limit)
