import asyncio
import hashlib
import json
import time
import pytest
from fastapi.testclient import TestClient
from crewsense_signals.ppg.sources import synthetic_batches
from crewsense_signals.ppg.schemas import Quality
from app.main import app
from app.signals.models import SessionRequest, WaveformBatch, CheckRequest
from app.signals.runtime import Session, registry
from app.signals.checks import build_check
from app.signals.bp import BPBuffer, configured_model


def req(subject='crew-one',device='device-one'):
    return SessionRequest(subject_id=subject,device_id=device,mode='measurement',input='ingest',source='live')


def frame(s,b):
    return WaveformBatch.model_validate(b.model_dump() | {
        'subject_id':s.req.subject_id,'session_id':s.id,'device_id':s.req.device_id,
        'source':s.req.source,'simulated':s.req.source=='synthetic'})


def test_two_subjects_process_once_with_bounded_subscriptions():
    async def scenario():
        a,b=Session(req()),Session(req('crew-two','device-two'))
        qa,qb=a.subscribe(),a.subscribe()
        for raw in synthetic_batches(65,bpm=72): await a.process(frame(a,raw))
        for raw in synthetic_batches(15,bpm=120): await b.process(frame(b,raw))
        assert a.latest.metrics['pulse_rate_bpm'].value==pytest.approx(72,abs=2)
        assert b.latest.metrics['pulse_rate_bpm'].value==pytest.approx(120,abs=2)
        assert len(a.history)==65 and qa.qsize()<=2 and qb.qsize()<=2
        assert a.latest.metrics['ppg_rmssd_ms'].status=='valid'
        assert a.latest.alerts==[]
        assert a.latest.capabilities['red_flags']=='disabled_no_reviewed_rules'
        with pytest.raises(ValueError,match='identity'): await a.process(frame(b,next(synthetic_batches())))
    asyncio.run(scenario())


def test_duplicate_overlap_rejected_without_poisoning():
    async def scenario():
        s=Session(req());batches=list(synthetic_batches(3))
        await s.process(frame(s,batches[0]))
        with pytest.raises(ValueError,match='duplicate'): await s.process(frame(s,batches[0]))
        with pytest.raises(ValueError,match='overlapping'):
            await s.process(frame(s,batches[1]).model_copy(update={'t0_s':.5}))
        await s.process(frame(s,batches[1]))
        assert s.latest.sequence==1 and len(s.history)==2
    asyncio.run(scenario())


def test_stale_invalidates_and_reconnect_rewarms():
    async def scenario():
        s=Session(req());batches=list(synthetic_batches(20))
        for raw in batches[:15]: await s.process(frame(s,raw))
        assert s.latest.metrics['pulse_rate_bpm'].value is not None
        await s.invalidate('stale')
        assert all(m.value is None for m in s.latest.metrics.values())
        assert s.bp is None
        await s.process(frame(s,batches[15]))
        assert s.latest.metrics['pulse_rate_bpm'].status=='warming_up'
        s.last_at=time.monotonic()-4
        t=asyncio.create_task(s.watchdog());await asyncio.sleep(.3)
        assert s.state=='stale'
        s.stopped=True;t.cancel();await asyncio.gather(t,return_exceptions=True)
    asyncio.run(scenario())


def test_api_ingest_broadcast_and_idempotent_server_check():
    with TestClient(app) as client:
        response=client.post('/api/v2/signal-sessions',json=req().model_dump())
        assert response.status_code==201
        sid=response.json()['id'];s=registry.get(sid)
        with client.websocket_connect('/ws/v2/ingest?session_id='+sid) as sender:
            for raw in synthetic_batches(70):
                sender.send_json(frame(s,raw).model_dump());assert sender.receive_json()['ok']
            with client.websocket_connect('/ws/v2/vitals?session_id='+sid) as viewer:
                data=viewer.receive_json()
                assert data['latest']['sequence']==69
                assert data['latest']['metrics']['spo2_pct']['value'] is None
            request={'check_id':'check-0001','session_id':sid,'seated_start_s':0,'seated_end_s':70}
            check=client.post('/api/v2/checks',json=request)
            assert check.status_code==200,check.text
            result=check.json()
            assert result['metrics']['pulse_rate_bpm']['value']==pytest.approx(72,abs=2)
            assert result['metrics']['ppg_rmssd_ms']['value'] is not None
            assert result['score'] is None and result['cuff'] is None
            assert client.post('/api/v2/checks',json=request).json()==result
            assert client.post('/api/v2/checks',json=request|{'bp_sys':120,'bp_dia':80}).status_code==409
            assert len(client.get('/api/v2/checks?subject_id=crew-one').json())==1
            assert client.post('/api/v2/checks',json=request|{'check_id':'check-0002','seated_end_s':999}).status_code==422
        assert client.get('/api/v2/signal-sessions/'+sid).json()['status']=='stale'
        assert client.post('/api/v2/signal-sessions/'+sid+'/stop').json()['status']=='ended'
    assert client.get('/api/v2/signal-sessions/'+sid).json()['status']=='ended'
    assert len(client.get('/api/v2/checks?subject_id=crew-one').json())==1


def test_posture_boundaries_and_bad_quality_never_use_persona_values():
    async def scenario():
        s=Session(req())
        for raw in synthetic_batches(70): await s.process(frame(s,raw))
        r=build_check(s,CheckRequest(check_id='partial-001',session_id=s.id,seated_start_s=65,seated_end_s=70))
        assert all(m['value'] is None for m in r['metrics'].values())
        assert r['assessment']=='not_assessed'
        s=Session(req())
        for raw in synthetic_batches(15):
            raw.channels={'ppg':[1.]*125};await s.process(frame(s,raw))
        r=build_check(s,CheckRequest(check_id='poor-signal-01',session_id=s.id,seated_start_s=0,seated_end_s=15,bp_sys=118,bp_dia=76))
        assert r['metrics']['pulse_rate_bpm']['value'] is None
        assert r['cuff']['method']=='cuff_manual_entry'
        assert r['blood_pressure_research'] is None
    asyncio.run(scenario())


def test_bad_identity_channels_and_origin_cannot_enter():
    with TestClient(app) as client:
        sid=client.post('/api/v2/signal-sessions',json=req().model_dump()).json()['id'];s=registry.get(sid)
        with client.websocket_connect('/ws/v2/ingest?session_id='+sid) as sender:
            payload=frame(s,next(synthetic_batches())).model_dump()
            sender.send_json(payload|{'subject_id':'someone-else'});assert sender.receive_json()['ok'] is False
            assert s.latest is None
            payload['channels']['ecg']=[1.]*124
            sender.send_json(payload);assert sender.receive_json()['ok'] is False
        from starlette.websockets import WebSocketDisconnect
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect('/ws/v2/vitals?session_id='+sid,headers={'origin':'https://untrusted.example'}): pass


def test_recording_paths_sources_and_replay_eof(tmp_path,monkeypatch):
    monkeypatch.setenv('COPILOT_RECORDINGS_DIR',str(tmp_path))
    with TestClient(app) as client:
        assert client.post('/api/v2/signal-sessions',json=req().model_dump()|{'input':'synthetic'}).status_code==422
        assert client.post('/api/v2/signal-sessions',json=req().model_dump()|{'input':'bidmc','source':'public_replay','recording':'../secret.csv'}).status_code==422
        assert client.get('/api/v2/recordings').json()==[]
        r=client.post('/api/v2/signal-sessions',json=req().model_dump()|{'mode':'research','input':'synthetic','source':'synthetic','speed':20,'duration_s':15})
        assert r.status_code==201
        sid=r.json()['id'];deadline=time.monotonic()+3
        while time.monotonic()<deadline:
            data=client.get('/api/v2/signal-sessions/'+sid).json()
            if data['status']=='ended':break
            time.sleep(.05)
        assert data['status']=='ended' and data['latest']['simulated']
        assert all(v['value'] is None for v in data['latest']['metrics'].values())


def test_failed_pilot_and_forged_gate_never_enable_bp(tmp_path,monkeypatch):
    monkeypatch.setenv('COPILOT_ENABLE_RESEARCH_BP','1')
    artifact=tmp_path/'model.npz';artifact.write_bytes(b'not a model');report=tmp_path/'report.json'
    report.write_text(json.dumps({'adoption':{'passed':False,'conditions':{}},'artifact_sha256':hashlib.sha256(artifact.read_bytes()).hexdigest()}))
    monkeypatch.setenv('COPILOT_BP_MODEL',str(artifact));monkeypatch.setenv('COPILOT_BP_REPORT',str(report))
    assert configured_model()[1]=='pilot_adoption_failed'
    report.write_text(json.dumps({'adoption':{'passed':True,'conditions':{}},'artifact_sha256':'wrong'}))
    assert configured_model()[0] is None


def test_bp_requires_ecg_and_resets_at_gap(monkeypatch):
    from app.signals import bp
    class FakeCPU:
        metadata={'architecture':'test_only'}
        def predict(self,x):
            assert x.shape==(2,1024)
            return [120.,80.]
    monkeypatch.setattr(bp,'configured_model',lambda:(FakeCPU(),None))
    monkeypatch.setenv('COPILOT_BP_MODEL',__file__)
    buffer=BPBuffer();s=Session(req());batches=list(synthetic_batches(12))
    for raw in batches[:8]:
        b=frame(s,raw);b.channels['ecg']=b.channels['ppg'];result=buffer.process(b,Quality(status='usable'))
    assert result['systolic_mmHg'] is None
    b=frame(s,batches[8]);b.channels['ecg']=b.channels['ppg']
    result=buffer.process(b,Quality(status='usable'))
    assert result['systolic_mmHg']==120 and not result['assessment_enabled']
    b=frame(s,batches[10]);b.channels['ecg']=b.channels['ppg']
    assert buffer.process(b,Quality(status='usable'))['systolic_mmHg'] is None
    assert buffer.process(frame(s,batches[11]),Quality(status='usable'))['systolic_mmHg'] is None


def test_legacy_check_rejects_only_bad_signal(client):
    from app import store
    bad=store.persona('A')['stream'][0]|{'signal_quality':0}
    assert client.post('/api/check',json={'persona':'A','seated_frames':[bad]}).status_code==422


def test_manual_reaction_and_emergency_are_bound_to_session():
    with TestClient(app) as client:
        sid=client.post('/api/v2/signal-sessions',json=req().model_dump()).json()['id']
        pvt={'median_ms':250,'lapses':0,'false_starts':0,'n':10,'duration_s':180,'version':'full','reaction_ms':[250]*10}
        assert client.post('/api/v2/reaction-tests',json={'session_id':sid,'result':pvt}).status_code==200
        assert client.post('/api/v2/reaction-tests',json={'session_id':sid,'result':pvt|{'n':0}}).status_code==422
        response=client.post('/api/v2/emergency-logs',json={'session_id':sid,'subject_id':'crew-one','data':{'protocol':'chest_pain','trigger':'crew','log':[]}})
        assert response.status_code==200
        assert client.post('/api/v2/emergency-logs',json={'session_id':sid,'subject_id':'other','data':{}}).status_code==422
        from app import db
        assert db.counts()['alerts']==0
        assert db.counts()['emergency_logs']==0  # never recorded against a demo persona



def test_concurrent_retry_waiting_for_ingestion_is_idempotent():
    from app.routers.signals import check
    async def scenario():
        s=Session(req())
        registry.sessions[s.id]=s
        try:
            for raw in synthetic_batches(15): await s.process(frame(s,raw))
            request=CheckRequest(check_id='concurrent-check',session_id=s.id,seated_start_s=0,seated_end_s=15)
            await s.lock.acquire()
            first=asyncio.create_task(check(request))
            second=asyncio.create_task(check(request))
            await asyncio.sleep(0)
            s.lock.release()
            a,b=await asyncio.gather(first,second)
            assert a==b
            assert len(storage.list_checks(s.req.subject_id))==1
        finally:
            registry.sessions.pop(s.id,None)
    from app.signals import storage
    asyncio.run(scenario())


def test_default_ppg_session_never_initializes_optional_model(monkeypatch):
    import app.signals.runtime as runtime
    monkeypatch.setenv('COPILOT_ENABLE_RESEARCH_BP','1')
    def forbidden():
        raise AssertionError('default PPG session must not initialize BP')
    monkeypatch.setattr(runtime,'BPBuffer',forbidden)
    async def scenario():
        s=Session(req())
        for raw in synthetic_batches(15): await s.process(frame(s,raw))
        assert s.latest.metrics['pulse_rate_bpm'].value is not None
        assert s.bp is None and s.info()['blood_pressure'] is None
        result=build_check(s,CheckRequest(check_id='cuff-without-model',session_id=s.id,seated_start_s=0,seated_end_s=15,bp_sys=118,bp_dia=76))
        assert result['cuff']['systolic_mmHg']==118
        assert result['blood_pressure_research'] is None
    asyncio.run(scenario())


def test_optional_model_needs_server_opt_in_and_research_mode(monkeypatch):
    monkeypatch.delenv('COPILOT_ENABLE_RESEARCH_BP',raising=False)
    with TestClient(app) as client:
        capability=client.get('/api/v2/bp-capability').json()
        assert capability['enabled'] is False and capability['reason']=='feature_disabled'
        body=req().model_dump()|{'enable_research_bp':True}
        assert client.post('/api/v2/signal-sessions',json=body).status_code==422
        response=client.post('/api/v2/signal-sessions',json=body|{'mode':'research'})
        assert response.status_code==422 and 'feature_disabled' in response.json()['detail']
        normal=client.post('/api/v2/signal-sessions',json=req().model_dump())
        assert normal.status_code==201 and normal.json()['blood_pressure'] is None


def test_explicit_option_does_not_bypass_failed_accuracy_gate(monkeypatch,tmp_path):
    model=tmp_path/'model.npz';model.write_bytes(b'test-only-invalid-artifact')
    report=tmp_path/'report.json';report.write_text(json.dumps({'adoption':{'passed':False,'conditions':{}}}))
    monkeypatch.setenv('COPILOT_ENABLE_RESEARCH_BP','1')
    monkeypatch.setenv('COPILOT_BP_MODEL',str(model));monkeypatch.setenv('COPILOT_BP_REPORT',str(report))
    with TestClient(app) as client:
        capability=client.get('/api/v2/bp-capability').json()
        assert capability['enabled'] is True and capability['available'] is False
        assert capability['reason']=='pilot_adoption_failed'
        response=client.post('/api/v2/signal-sessions',json=req().model_dump()|{'mode':'research','enable_research_bp':True})
        assert response.status_code==422 and 'pilot_adoption_failed' in response.json()['detail']


def test_app_import_does_not_require_bp_addon():
    import subprocess,sys
    from pathlib import Path
    code='''
import sys,importlib.abc
class BlockBP(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.startswith(('crewsense_bp','crewsense_signals.bp')):
            raise ImportError('optional add-on intentionally unavailable')
sys.meta_path.insert(0,BlockBP())
from app.main import app
from app.signals.runtime import Session
from app.signals.models import SessionRequest
s=Session(SessionRequest(subject_id='s',device_id='d'))
assert s.bp is None
assert not any(n.startswith('crewsense_bp') for n in sys.modules)
'''
    completed=subprocess.run([sys.executable,'-c',code],capture_output=True,text=True,cwd=Path(__file__).resolve().parents[1])
    assert completed.returncode==0,completed.stderr
