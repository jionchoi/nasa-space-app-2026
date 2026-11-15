"""Additional SQLite tables; no changes to the existing persona demo records."""
import json
from .. import db

SCHEMA = '''
CREATE TABLE IF NOT EXISTS signal_sessions (
  id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS signal_checks (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, subject_id TEXT NOT NULL,
  created_at TEXT NOT NULL, request TEXT NOT NULL, result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS signal_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, subject_id TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS signal_emergencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, subject_id TEXT NOT NULL, data TEXT NOT NULL);
'''


def save_session(session):
    info = session.info()
    info.pop('latest', None)
    with db.connect() as conn:
        conn.executescript(SCHEMA)
        conn.execute('INSERT OR REPLACE INTO signal_sessions VALUES (?, ?, ?)',
                     (session.id, session.req.subject_id, json.dumps(info)))


def saved_session(sid):
    with db.connect() as conn:
        conn.executescript(SCHEMA)
        row = conn.execute('SELECT data FROM signal_sessions WHERE id=?', (sid,)).fetchone()
    if row is None:
        return None
    data = json.loads(row[0])
    data.update(status='ended', error='session_not_active_in_this_process', latest=None)
    return data


def get_check(cid):
    with db.connect() as conn:
        conn.executescript(SCHEMA)
        row = conn.execute('SELECT request,result FROM signal_checks WHERE id=?', (cid,)).fetchone()
    return (json.loads(row[0]), json.loads(row[1])) if row else None


def save_check(request, result):
    with db.connect() as conn:
        conn.executescript(SCHEMA)
        conn.execute('INSERT INTO signal_checks VALUES (?,?,?,?,?,?)',
            (request.check_id,request.session_id,result['subject_id'],result['created_at'],
             json.dumps(request.model_dump()),json.dumps(result)))


def list_checks(subject):
    with db.connect() as conn:
        conn.executescript(SCHEMA)
        rows = conn.execute('SELECT result FROM signal_checks WHERE subject_id=? ORDER BY created_at DESC LIMIT 100', (subject,)).fetchall()
    return [json.loads(row[0]) for row in rows]


def save_emergency(subject, sid, data):
    with db.connect() as conn:
        conn.executescript(SCHEMA)
        return conn.execute('INSERT INTO signal_emergencies (session_id,subject_id,data) VALUES (?,?,?)',
                            (sid,subject,json.dumps(data))).lastrowid


def save_observation(subject, sid, data):
    with db.connect() as conn:
        conn.executescript(SCHEMA)
        return conn.execute('INSERT INTO signal_observations (session_id,subject_id,data) VALUES (?,?,?)',
                            (sid,subject,json.dumps(data))).lastrowid
