"""Run the integrated local app. No downloads, training or second signal server."""
import argparse
import os
from pathlib import Path
import uvicorn


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recordings-dir',type=Path)
    parser.add_argument('--enable-research-bp', action='store_true', help='Enable the separately installed research BP add-on')
    parser.add_argument('--bp-model',type=Path)
    parser.add_argument('--bp-report',type=Path)
    parser.add_argument('--port',type=int,default=8000)
    args=parser.parse_args()
    if args.enable_research_bp:
        os.environ['COPILOT_ENABLE_RESEARCH_BP']='1'
    for key,value in [('COPILOT_RECORDINGS_DIR',args.recordings_dir),('COPILOT_BP_MODEL',args.bp_model),('COPILOT_BP_REPORT',args.bp_report)]:
        if value is not None: os.environ[key]=str(value.resolve())
    uvicorn.run('app.main:app',app_dir=str(Path(__file__).resolve().parents[1]/'backend'),host='127.0.0.1',port=args.port)


if __name__=='__main__':main()
