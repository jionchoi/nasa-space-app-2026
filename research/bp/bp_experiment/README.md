# CPU 혈압 모델 파일럿

기존 PPG 서비스와 분리한 CPU 전용 연구 실험이다. 자체 작은 1D CNN으로 동기화된 ECG·PPG에서 현재 구간의 SBP·DBP를 추정한다. Shallow U-Net의 복제나 논문 정확도 재현이 아니며 원저자의 코드·가중치를 복사하지 않았다.

## 고정한 시험 방법

- `protocol.json`을 학습 전 작성했다. seed=20261115, 서로 다른 사람 96명, 학습 60명 / validation 18명 / 최종 test 18명이다. 수술 기록 번호 대신 API의 `Patient/{subjectid}`로 사람을 구분하고 중복 수술을 제외한다.
- 현재 로컬 BIDMC 파일에는 정답 혈압이 없어, **PulseDB의 원천 중 하나인 VitalDB의 원본**을 공식 FHIR API에서 직접 읽는다. PulseDB의 정제 자료나 공식 벤치마크 분할을 사용한 것은 아니다.
- 고정 seed로 섞은 기록 순서에서 ECG·PPG·ART 세 채널이 있고 유효 window가 충분한 첫 고유 환자를 선택한다. 채널 공통 범위의 중간 20분까지 사용하고, 환자당 최대 120개 window를 시간상 균등하게 선택한다. 선택·제외 내역과 해시는 manifest에 기록한다.
- 원본 500Hz에서 **겹치지 않는 8.192초**를 먼저 자르고, 해당 구간 안에서 ECG·PPG만 125Hz / 1024점으로 downsample한다. 기록 간 연결, 누락 보간, 정답을 이용한 시간 이동을 하지 않는다.
- 모델 입력은 ECG·PPG 두 파형뿐이다. ART는 동일 구간 systolic peak들의 중앙값과 인접 peak 사이 diastolic trough들의 중앙값을 구하는 정답 용도로만 사용한다. 환자 ID·나이·수술 정보·혈압은 입력에 없다.
- ECG 0.5–40Hz / PPG 0.5–12Hz window 내 필터링 후 채널별 z-score를 적용한다. 완성된 과거 window만 사용한다. 실행과 학습의 전처리가 같다.
- 결측·flatline 입력, 정답 ART 결측·비정상적인 박동 구간·넓은 물리 범위를 벗어난 정답은 제외한다. 고혈압/저혈압을 정상 범위로 맞추는 제한은 아니지만, 이 제외로 coverage와 표본 편향이 생긴다. 실제 움직임에 대해 검증된 SQI는 아니다.
- 목표 혈압의 평균/표준편차는 학습 사람에서만 구한다. 조기 종료와 checkpoint 선택에는 validation만 사용한다. 최종 test에는 개인별 혈압 보정을 제공하지 않는다.
- 비교 기준은 학습 구간 평균 혈압을 모든 test 구간에 출력하는 baseline이다. window 단위와 환자별 오차를 같은 비중으로 평균한 값 모두 기록한다.

## 채택 기준

개발상의 임시 기준이며 임상 인증 기준이 아니다. 아래 조건을 모두 만족해야 다음 통합 후보로 본다.

- 최종 test SBP MAE ≤10mmHg, DBP MAE ≤7mmHg. window 평균과 환자별 macro 평균 모두 충족.
- 두 혈압 모두 학습 평균 baseline보다 MAE 10% 이상 개선. window / 환자별 평균 모두 충족.
- 파라미터 ≤100만 개, 저장 artifact ≤4MiB, batch=1 CPU 전처리+추론 p95 ≤1초.
- 최종 test는 15명 이상. 실제 우주선 CPU, 전력, 의료 사용에 대한 검증은 별도다.

실패하면 기존 API·알림에는 혈압을 연결하지 않는다. 성공해도 이 파일럿만으로 의료/비행 사용을 승인한 것은 아니다.

## 실행

프로젝트 루트에서 실행한다. 설치·다운로드 후 학습과 추론에는 인터넷이 필요 없다.

```bash
.venv/bin/python -m pip install -e '.[bp]'
.venv/bin/python -m bp_experiment.data --subjects 96 --workers 4 --max-candidates 400
.venv/bin/python -m bp_experiment.train
.venv/bin/python -m bp_experiment.predict --model output/bp_cpu/tiny_bp_cpu.npz --input output/bp_cpu/sample_ecg_ppg.npz --research
.venv/bin/python -m bp_experiment.benchmark --model output/bp_cpu/tiny_bp_cpu.npz --sample output/bp_cpu/sample_ecg_ppg.npz
```

이 환경과 동일한 의존성 버전으로 설치하려면 `requirements-bp.lock`을 사용한다. PyTorch는 학습에만 필요하다. 내보낸 CPU 모델 실행은 NumPy·SciPy만 사용하며 기본 PPG 서비스에도 PyTorch 설치가 필수가 아니다. 벤치마크의 RSS 측정에는 psutil을 추가 사용한다.

`train`은 기존 최종 보고서가 있으면 재실행을 거부한다. 같은 test 결과를 보고 반복 조정하지 않도록 한 장치다. 새 실험은 새 프로토콜·별도 최종 평가 표본으로 진행해야 한다.

`predict`는 `x` 배열 `(2,1024)`인 NPZ를 받는다. 채널 순서는 ECG, PPG이며 동기화된 125Hz 입력이어야 한다. 결과에 `research_unvalidated`, `service_enabled=false`를 명시한다. 실제 센서 ingestion이나 현행 `sensing` 서비스에는 자동 연결되지 않는다.

## 결과 파일

- `validation/bp_cpu_pilot.json`: 정확도, baseline, 사람별 오차, 분할 목록, 학습 기록, 벤치마크, 채택 판정.
- `data/manifests/vitaldb_bp_pilot.manifest.json`: 원자료 출처·제외·window 해시·라이선스 메모.
- `output/bp_cpu/tiny_bp_cpu.npz`: NumPy CPU 추론 가중치와 학습 사람에서 얻은 출력 scale. eval BatchNorm을 convolution에 접어 넣으며 양자화하지 않는다.
- `output/bp_cpu/tiny_bp.pt`: PyTorch 학습 checkpoint. 탑재용 추론에는 불필요하다.
- `output/bp_cpu/patient_split.json`, `test_predictions.csv`: 분할과 최종 test 예측.
- `output/bp_cpu/sample_ecg_ppg.npz`: 로컬 재실행용 ECG·PPG만 포함한 입력 예시.

벤치마크는 학습과 별도 프로세스에서 BLAS thread 제한을 1로 요청하고 batch 1, 30회 준비 후 300회 측정한다. 입력 품질 검사·필터·정규화·forward·출력 복원을 포함하며 원본 500Hz downsample, 디스크 IO, import, 신호 수집 시간은 제외한다. PyTorch를 import하지 않은 Python·NumPy·SciPy 런타임 포함 프로세스 RSS와 import 후 대비 증가량을 구분한다. 작은 가중치 파일이 전체 실행환경도 작다는 뜻은 아니다. 내보낸 모델과 PyTorch의 예측 차이가 validation 최대 100개 window에서 0.001mmHg 이하여야 최종 평가를 진행한다.

## 데이터 출처와 이용 조건

- Lee et al., *VitalDB, a high-fidelity multi-parameter vital signs database in surgical patients*, Scientific Data (2022), https://doi.org/10.1038/s41597-022-01411-5
- 공식 데이터셋/이용약관: https://vitaldb.net/dataset/
- 공식 API: https://api.vitaldb.net/openapi.json

확인 시점에 데이터셋 페이지는 **CC BY-NC-SA 4.0 및 별도 이용약관**, 새 API 명세는 **CC BY 4.0**을 표시해 서로 다르다. 두 출처를 모두 기록하고, 이 작업은 사용자가 요청한 로컬 연구·공모전용 성능 시험으로 한정한다. 원파형과 환자별 가공 window는 `data/raw/` 및 `output/` 아래 Git 제외 경로에 두고 외부로 전송·게시하지 않는다. 상업 이용·가중치 재배포 권한까지 확인했다는 뜻이 아니다. PyTorch 등 의존성의 라이선스는 해당 배포물에 따른다.
