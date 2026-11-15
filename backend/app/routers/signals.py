from __future__ import annotations

import asyncio
from pathlib import Path
import os

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import ValidationError, Field
from crewsense_signals.ppg.schemas import Model
from ..models import PvtResult
from ..signals.runtime import now
from ..signals.models import SessionRequest, WaveformBatch, CheckRequest
from ..signals.runtime import registry, recording_path
from ..signals import storage
from ..signals.checks import build_check
from ..signals.bp import configured_model, research_bp_enabled

router = APIRouter()


def get_session(sid):
    try:
        return registry.get(sid)
    except KeyError:
        raise HTTPException(404,'session not active; create a new session')


def allowed_origin(ws):
    return ws.headers.get('origin') in {None,'http://localhost:5173','http://127.0.0.1:5173'}


@router.get('/api/v2/recordings')
def recordings():
    root = os.getenv('COPILOT_RECORDINGS_DIR')
    if not root or not Path(root).is_dir():
        return []
    result=[]
    for p in sorted(Path(root).iterdir()):
        if p.suffix in {'.csv','.jsonl'}:
            try:
                recording_path(p.name)
            except ValueError:
                continue
            result.append({'name':p.name,'input':'bidmc' if p.suffix=='.csv' else 'recording',
                           'source':'public_replay' if p.suffix=='.csv' else 'recorded_live'})
    return result


@router.get('/api/v2/bp-capability')
def bp_capability():
    model,reason=configured_model()
    return {'enabled':research_bp_enabled(),'available':model is not None,'reason':reason,'assessment_enabled':False,'status':'research_unvalidated'}


@router.post('/api/v2/signal-sessions',status_code=201)
async def create_session(req: SessionRequest):
    try:
        return (await registry.create(req)).info()
    except ValueError as exc:
        raise HTTPException(422,str(exc))


@router.get('/api/v2/signal-sessions/{sid}')
def session(sid: str):
    if sid in registry.sessions:
        return registry.sessions[sid].info()
    data = storage.saved_session(sid)
    if data is None:
        raise HTTPException(404,'unknown session')
    return data


@router.post('/api/v2/signal-sessions/{sid}/stop')
async def stop_session(sid: str):
    s=get_session(sid)
    await s.stop()
    return s.info()


@router.websocket('/ws/v2/ingest')
async def ingest(ws: WebSocket,session_id: str):
    if not allowed_origin(ws) or session_id not in registry.sessions:
        await ws.close(code=1008); return
    s=registry.get(session_id)
    if s.req.input!='ingest' or s.ingesting or s.stopped or s.state in {'ended','error'}:
        await ws.close(code=1008); return
    s.ingesting=True
    await ws.accept()
    try:
        while True:
            raw=await ws.receive_text()
            if len(raw)>1_000_000:
                await ws.close(code=1009); break
            try:
                b=WaveformBatch.model_validate_json(raw)
                await s.process(b)
                await ws.send_json({'ok':True,'sequence':b.sequence})
            except (ValidationError,ValueError) as exc:
                await ws.send_json({'ok':False,'error':str(exc)[:300]})
    except WebSocketDisconnect:
        pass
    finally:
        s.ingesting=False
        if not s.stopped and s.state not in {'ended','error'}:
            await s.invalidate('stale')


@router.websocket('/ws/v2/vitals')
async def vitals(ws: WebSocket,session_id: str):
    if not allowed_origin(ws) or session_id not in registry.sessions:
        await ws.close(code=1008); return
    s=registry.get(session_id)
    await ws.accept()
    q=s.subscribe()
    async def watch_close():
        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
    closed=asyncio.create_task(watch_close())
    try:
        while not closed.done():
            try:
                message=await asyncio.wait_for(q.get(), timeout=.25)
            except asyncio.TimeoutError:
                continue
            await ws.send_json(message)
    except (WebSocketDisconnect, RuntimeError, asyncio.CancelledError):
        pass
    finally:
        closed.cancel()
        s.queues.discard(q)


@router.post('/api/v2/checks')
async def check(req: CheckRequest):
    previous=storage.get_check(req.check_id)
    if previous:
        if previous[0]!=req.model_dump():
            raise HTTPException(409,'check ID already used for a different request')
        return previous[1]
    s=get_session(req.session_id)
    try:
        async with s.lock:
            # Another request may have saved the same check while we waited for ingestion.
            previous=storage.get_check(req.check_id)
            if previous:
                if previous[0]!=req.model_dump():
                    raise HTTPException(409,'check ID already used for a different request')
                return previous[1]
            result=build_check(s,req)
            storage.save_check(req,result)
            return result
    except ValueError as exc:
        raise HTTPException(422,str(exc))


@router.get('/api/v2/checks')
def checks(subject_id: str):
    return storage.list_checks(subject_id)


class EmergencyRecord(Model):
    subject_id: str = Field(min_length=1,max_length=100)
    session_id: str
    data: dict


@router.post('/api/v2/emergency-logs')
def emergency(req: EmergencyRecord):
    info=registry.sessions[req.session_id].info() if req.session_id in registry.sessions else storage.saved_session(req.session_id)
    if not info or info['subject_id']!=req.subject_id:
        raise HTTPException(422,'session and subject must match')
    return {'id':storage.save_emergency(req.subject_id,req.session_id,req.data),'ok':True}


class ReactionRecord(Model):
    session_id: str
    result: PvtResult


@router.post('/api/v2/reaction-tests')
def reaction(req: ReactionRecord):
    s=get_session(req.session_id)
    return {'ok':True,'id':storage.save_observation(s.req.subject_id,s.id,
        {'kind':'pvt','recorded_at':now(),
         'method':'browser_reaction_test','data':req.result.model_dump(),'assessment':'not_assessed'})}
