"""Utilities to help with creating and managing connections in Mathesar."""
from sqlalchemy.exc import OperationalError
from mathesar.models.deprecated import Connection
from db import install, connection as dbconn


class BadInstallationTarget(Exception):
    """Raise when an attempt is made to install on a disallowed target"""
    pass


def copy_connection_from_preexisting(
        connection, nickname, db_name, create_db, sample_data
):
    if connection['connection_type'] == 'internal_database':
        conn_model = Connection.create_from_settings_key('default')
    elif connection['connection_type'] == 'user_database':
        conn_model = Connection.current_objects.get(id=connection['id'])
        conn_model.id = None
    else:
        raise KeyError("connection_type")
    root_db = conn_model.db_name
    return _save_and_install(
        conn_model, db_name, root_db, nickname, create_db, sample_data
    )


def create_connection_from_scratch(
        user, password, host, port, nickname, db_name, sample_data
):
    conn_model = Connection(username=user, password=password, host=host, port=port)
    root_db = db_name
    return _save_and_install(
        conn_model, db_name, root_db, nickname, False, sample_data
    )


def create_connection_with_new_user(
        connection, user, password, nickname, db_name, create_db, sample_data
):
    conn_model = copy_connection_from_preexisting(
        connection, nickname, db_name, create_db, []
    )
    engine = conn_model._sa_engine
    conn_model.username = user
    conn_model.password = password
    conn_model.save()
    dbconn.execute_msar_func_with_engine(
        engine,
        'create_basic_mathesar_user',
        conn_model.username,
        conn_model.password
    )
    _load_sample_data(conn_model._sa_engine, sample_data)
    return conn_model


def _save_and_install(
        conn_model, db_name, root_db, nickname, create_db, sample_data
):
    conn_model.name = nickname
    conn_model.db_name = db_name
    _validate_conn_model(conn_model)
    conn_model.save()
    try:
        install.install_mathesar(
            database_name=conn_model.db_name,
            username=conn_model.username,
            password=conn_model.password,
            hostname=conn_model.host,
            port=conn_model.port,
            skip_confirm=True,
            create_db=create_db,
            root_db=root_db,
        )
    except OperationalError as e:
        conn_model.delete()
        raise e
    _load_sample_data(conn_model._sa_engine, sample_data)
    return conn_model


def _load_sample_data(engine, sample_data):
    pass


def _validate_conn_model(conn_model):
    internal_conn_model = Connection.create_from_settings_key('default')
    if (
            internal_conn_model is not None
            and conn_model.host == internal_conn_model.host
            and conn_model.port == internal_conn_model.port
            and conn_model.db_name == internal_conn_model.db_name
    ):
        raise BadInstallationTarget(
            "Mathesar can't be installed in the internal DB namespace"
        )
