#!/bin/sh
# 로컬/Codespaces 미리보기 — 정적 서버만 띄운다 (node·brew 불필요, 맥 기본 python3 사용).
#   사용법: ./serve.sh [포트]   (기본 8000)  →  http://localhost:8000
#
# 이 경로(localhost / Codespaces / file://)에서는 앱이 자동으로 '데모 모드(localStorage)'라
# 클릭하며 둘러봐도 라이브 크루 데이터(Firebase)를 절대 건드리지 않는다.
# 라이브(클라우드) 데이터를 실제로 봐야 하면 URL 뒤에 ?live=1 을 붙인다. (실데이터 주의!)
cd "$(dirname "$0")"
PORT="${1:-8000}"
echo "→ http://localhost:$PORT   (데모 모드 · Ctrl+C 로 종료)"
python3 -m http.server "$PORT"
