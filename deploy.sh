#!/bin/sh
# ============================================================
# 슈퍼리치키드 하계 MT — GitHub Pages 배포 스크립트
# 최초 배포와 이후 갱신 모두 이 스크립트 하나로 처리한다.
#   사용법: ./deploy.sh [저장소명]   (기본: crewfit)
#   선행 조건: gh CLI 로그인 (gh auth login --web)
# ============================================================
set -e
cd "$(dirname "$0")"

REPO_NAME="${1:-crewfit}"

# gh CLI 탐색 (PATH → ~/.local/bin 순)
if command -v gh >/dev/null 2>&1; then GH="gh"
elif [ -x "$HOME/.local/bin/gh" ]; then GH="$HOME/.local/bin/gh"
else
  echo "✗ gh CLI를 찾을 수 없습니다. https://cli.github.com 에서 설치 후 재실행하세요."
  exit 1
fi

if ! "$GH" auth status >/dev/null 2>&1; then
  echo "✗ GitHub 로그인이 필요합니다. 먼저 실행:  $GH auth login --web"
  exit 1
fi

LOGIN="$("$GH" api user --jq .login)"
USER_ID="$("$GH" api user --jq .id)"

# git 사용자 설정 (저장소 로컬, 미설정 시에만 GitHub 계정 기준으로)
git rev-parse --git-dir >/dev/null 2>&1 || git init -q
git config user.name  >/dev/null 2>&1 || git config user.name "$LOGIN"
git config user.email >/dev/null 2>&1 || git config user.email "${USER_ID}+${LOGIN}@users.noreply.github.com"

# 캐시버스팅: 배포마다 css/js 버전 쿼리를 타임스탬프로 갱신 (브라우저 캐시로 수정이 안 보이는 문제 방지)
VER="$(date +%Y%m%d%H%M%S)"
sed -i '' -E "s#(styles\.css|app\.js|config\.js|favicon\.svg|favicon\.png|favicon\.ico|og-cover\.png)\?v=[0-9]+#\1?v=$VER#g" index.html 2>/dev/null \
  || sed -i -E "s#(styles\.css|app\.js|config\.js|favicon\.svg|favicon\.png|favicon\.ico|og-cover\.png)\?v=[0-9]+#\1?v=$VER#g" index.html
echo "→ 캐시버스팅 버전: $VER"

# 공유 상태판(STATUS.md) 자동 스탬프 — 어느 기기에서 배포했는지/뭘 바꿨는지 기록
if [ -f STATUS.md ]; then
  HOST="$(hostname 2>/dev/null | sed 's/\.local$//')"
  [ -z "$HOST" ] && HOST="unknown-host"
  STAMP_WHEN="$(date '+%Y-%m-%d %H:%M')"
  # 이번에 바뀐 파일 (STATUS.md 자신·index.html 버전노이즈 제외, 최대 8개)
  CHANGED="$(git status --porcelain 2>/dev/null | awk '{print $2}' | grep -vE '^(STATUS\.md|index\.html)$' | head -8 | tr '\n' ' ')"
  [ -z "$CHANGED" ] && CHANGED="(코드 변경 없음 — 재배포)"
  NEWBLOCK="$(printf '<!-- DEPLOY-STAMP:BEGIN -->\n**최근 배포(자동):** %s · 기기 `%s` · 버전 `%s`\n\n- 바뀐 파일: %s\n<!-- DEPLOY-STAMP:END -->' "$STAMP_WHEN" "$HOST" "$VER" "$CHANGED")"
  # 마커 사이를 새 블록으로 교체 (awk = BSD/GNU 공통)
  awk -v repl="$NEWBLOCK" '
    /<!-- DEPLOY-STAMP:BEGIN -->/ { print repl; skip=1; next }
    /<!-- DEPLOY-STAMP:END -->/   { skip=0; next }
    skip!=1 { print }
  ' STATUS.md > STATUS.md.tmp && mv STATUS.md.tmp STATUS.md
  # 맨 위 '마지막 갱신' 줄도 함께 갱신
  sed -i '' -E "s#^\*\*마지막 갱신:\*\*.*#**마지막 갱신:** $STAMP_WHEN / 자동 (deploy.sh @ $HOST)#" STATUS.md 2>/dev/null \
    || sed -i -E "s#^\*\*마지막 갱신:\*\*.*#**마지막 갱신:** $STAMP_WHEN / 자동 (deploy.sh @ $HOST)#" STATUS.md
  echo "→ STATUS.md 자동 스탬프 갱신 ($HOST)"
fi

# 커밋 (변경이 있을 때만)
git add -A
if ! git rev-parse HEAD >/dev/null 2>&1; then
  git commit -q -m "슈퍼리치키드 하계 MT 사이트 초기 배포"
elif ! git diff --cached --quiet; then
  git commit -q -m "업데이트 $(date +%Y-%m-%d)"
else
  echo "→ 새 변경 없음 (커밋 생략)"
fi

# main 브랜치 보장
git branch -M main 2>/dev/null || true

# 원격 저장소 연결/생성
if ! git remote get-url origin >/dev/null 2>&1; then
  if "$GH" repo view "$LOGIN/$REPO_NAME" >/dev/null 2>&1; then
    git remote add origin "https://github.com/$LOGIN/$REPO_NAME.git"
  else
    echo "→ public 저장소 생성: $LOGIN/$REPO_NAME"
    echo "  (무료 계정의 GitHub Pages는 public 저장소에서만 동작)"
    "$GH" repo create "$REPO_NAME" --public --source=. --remote=origin
  fi
fi

git push -u origin main

# GitHub Pages 활성화 — Branch: main, 폴더: / (root). 이미 켜져 있으면 통과.
"$GH" api -X POST "repos/$LOGIN/$REPO_NAME/pages" \
  -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 \
  && echo "→ GitHub Pages 활성화 완료 (main / root)" \
  || echo "→ GitHub Pages 이미 활성화됨"

echo ""
echo "✓ 크루 공유용 링크: https://$LOGIN.github.io/$REPO_NAME/"
echo "  (반영까지 1~2분 소요. 갱신도 push 후 1~2분 내 자동 반영)"
