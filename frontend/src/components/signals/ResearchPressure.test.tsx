import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ResearchPressure } from './ResearchPressure';
import { SignalControls } from './SignalControls';
import { BloodPressureStep } from '../check/BloodPressureStep';
const state=vi.hoisted(()=>({mode:'measurement',session:null as null|{enable_research_bp:boolean},now:Date.now(),connection:'connected',busy:false,error:null}));
vi.mock('../../state/SignalContext',()=>({useSignals:()=>state}));
describe('optional BP model UI',()=>{
  it('does not render the model card in measurement mode',()=>{
    state.mode='measurement';state.session={enable_research_bp:true};
    expect(renderToStaticMarkup(createElement(ResearchPressure))).toBe('');
    expect(renderToStaticMarkup(createElement(SignalControls))).not.toContain('Optional research features');
  });
  it('hides the card for a research session without explicit selection',()=>{
    state.mode='research';state.session={enable_research_bp:false};
    expect(renderToStaticMarkup(createElement(ResearchPressure))).toBe('');
  });
  it('offers a separate unchecked research option by default',()=>{
    state.mode='research';state.session=null;
    const html=renderToStaticMarkup(createElement(SignalControls));
    expect(html).toContain('Optional research features');
    expect(html).toContain('Enable optional blood pressure model');
    expect(html).not.toContain('checked=""');
  });
  it('keeps cuff entry without displaying a model result',()=>{
    state.mode='measurement';state.session=null;
    const limit={min:30,max:250,step:1,unit:'mmHg'};
    const html=renderToStaticMarkup(createElement(BloodPressureStep,{limits:{bp_sys:limit,bp_dia:limit},onDone:()=>{}}));
    expect(html).toContain('Blood pressure, top number');
    expect(html).toContain('Blood pressure, bottom number');
    expect(renderToStaticMarkup(createElement(ResearchPressure))).toBe('');
  });
});
