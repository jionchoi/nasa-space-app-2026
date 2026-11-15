"""Server-owned measured intervals, without persona carry-forward or clinical scoring."""
from statistics import median
from .runtime import now


def summarize_metric(history, key, start, end):
    eligible = [s.metrics[key] for s in history if s.quality.status == 'usable' and key in s.metrics
                and s.metrics[key].status == 'valid' and s.metrics[key].value is not None
                and s.metrics[key].measured_start_s >= start - 1e-6
                and s.metrics[key].measured_end_s <= end + 1e-6]
    if not eligible:
        return {'value': None, 'status': 'not_measured', 'reason': 'no_contiguous_usable_window_in_interval'}
    # Use the latest contiguous run, never aggregate across a reset/gap.
    latest = eligible[-1]
    run = [latest]
    for m in reversed(eligible[:-1]):
        if m.measured_end_s < run[-1].measured_start_s - 1e-6:
            break
        run.append(m)
    return {'value': round(median(m.value for m in run),3), 'status': 'valid',
            'unit': latest.unit, 'method': latest.method,
            'measured_start_s': min(m.measured_start_s for m in run),
            'measured_end_s': latest.measured_end_s, 'windows': len(run)}


def build_check(session, req):
    if not session.history or req.seated_end_s > session.history[-1].data_end_s + 1e-6:
        raise ValueError('measurement interval is not available on the server')
    if req.seated_start_s < session.history[0].data_end_s - 10:
        raise ValueError('measurement interval expired from bounded session history')
    if req.stand_end_s is not None and req.stand_end_s > session.history[-1].data_end_s + 1e-6:
        raise ValueError('standing interval is not available on the server')
    metrics = {key: summarize_metric(session.history,key,req.seated_start_s,req.seated_end_s)
               for key in ['pulse_rate_bpm','ppg_rmssd_ms','spo2_pct']}
    stand = summarize_metric(session.history,'pulse_rate_bpm',req.stand_start_s,req.stand_end_s) if req.stand_start_s is not None else None
    change = None
    if stand and stand['value'] is not None and metrics['pulse_rate_bpm']['value'] is not None:
        change = round(stand['value'] - metrics['pulse_rate_bpm']['value'],3)
    cuff = None if req.bp_sys is None else {'systolic_mmHg':req.bp_sys,'diastolic_mmHg':req.bp_dia,
        'method':'cuff_manual_entry','recorded_at':now(),'unit':'mmHg'}
    pressure = next((b for b in reversed(session.bp_history) if
        req.seated_start_s <= b['measured_start_s'] and b['measured_end_s'] <= req.seated_end_s),
        session.bp.unavailable(session.bp.disabled_reason or 'no_bp_window_in_interval') if session.bp else None)
    return {'id':req.check_id,'session_id':session.id,'subject_id':session.req.subject_id,
        'device_id':session.req.device_id,'source':session.req.source,'simulated':session.req.source=='synthetic',
        'mode':session.req.mode,'created_at':now(),'metrics':metrics,'standing':stand,'posture_change_bpm':change,
        'cuff':cuff,'manual':{'answers':req.answers,'temp_c':req.temp_c,'glucose_mmol':req.glucose_mmol,'pvt':req.pvt.model_dump() if req.pvt else None},
        'blood_pressure_research':pressure,'assessment':'not_assessed','score':None,
        'notes':['Only measured intervals are summarized. No persona history or clinical score is applied.',
                 'Incomplete measurements remain not measured; PPG RMSSD is PRV, not ECG HRV.']}
