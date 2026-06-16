#!/usr/bin/env python3
# ============================================================
# 슈퍼리치키드 MT — 앨범 사진/영상 48시간 자동 삭제
#  - Cloudinary에서 'srk-gallery' 태그가 붙은(=앨범 업로드) 에셋 중
#    업로드 후 MAX_AGE_HOURS(기본 48h)가 지난 것을 삭제한다.
#  - 아바타/히어로 배경은 태그가 없으므로 절대 삭제되지 않는다.
#  - 삭제한 에셋에 대응하는 Firebase /photos 레코드도 함께 제거해
#    앱 앨범에 깨진 썸네일이 남지 않게 한다.
#  표준 라이브러리만 사용(pip 설치 불필요).
# ============================================================
import os, sys, json, base64, datetime, urllib.request, urllib.parse, urllib.error

CLOUD   = os.environ.get("CLOUDINARY_CLOUD_NAME", "")
KEY     = os.environ.get("CLOUDINARY_API_KEY", "")
SECRET  = os.environ.get("CLOUDINARY_API_SECRET", "")
FB_URL  = os.environ.get("FIREBASE_DB_URL", "").rstrip("/")

if not (CLOUD and KEY and SECRET):
    # 시크릿(CLOUDINARY_API_KEY/SECRET) 미설정 — 워크플로를 실패시키지 않고 조용히 종료
    print("Cloudinary 시크릿이 아직 설정되지 않았어요. 저장소 Settings → Secrets에 "
          "CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET 추가 후 동작합니다. (이번 실행은 건너뜀)")
    sys.exit(0)
TAG     = os.environ.get("GALLERY_TAG", "srk-gallery")
MAX_AGE = float(os.environ.get("MAX_AGE_HOURS", "48"))
DRY     = os.environ.get("DRY_RUN", "false").lower() in ("1", "true", "yes")

AUTH = "Basic " + base64.b64encode(f"{KEY}:{SECRET}".encode()).decode()
API  = f"https://api.cloudinary.com/v1_1/{CLOUD}"
now  = datetime.datetime.now(datetime.timezone.utc)
cutoff = now - datetime.timedelta(hours=MAX_AGE)


def req(url, method="GET"):
    r = urllib.request.Request(url, method=method, headers={"Authorization": AUTH})
    with urllib.request.urlopen(r, timeout=60) as resp:
        return json.load(resp)


def list_old(rtype):
    """rtype('image'|'video')에서 TAG가 붙고 cutoff보다 오래된 public_id 목록."""
    old, cursor = [], None
    while True:
        q = {"max_results": 500}
        if cursor:
            q["next_cursor"] = cursor
        url = f"{API}/resources/{rtype}/tags/{urllib.parse.quote(TAG)}?{urllib.parse.urlencode(q)}"
        try:
            data = req(url)
        except urllib.error.HTTPError as e:
            print(f"  [{rtype}] list 오류 {e.code}: {e.read().decode()[:200]}")
            break
        for res in data.get("resources", []):
            ca = res.get("created_at")
            try:
                dt = datetime.datetime.strptime(ca, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
            except Exception:
                continue
            if dt < cutoff:
                old.append(res["public_id"])
        cursor = data.get("next_cursor")
        if not cursor:
            break
    return old


def delete_batch(rtype, public_ids):
    """public_ids를 100개씩 삭제. 삭제된 public_id 집합 반환."""
    done = set()
    for i in range(0, len(public_ids), 100):
        chunk = public_ids[i:i + 100]
        if DRY:
            print(f"  [DRY] {rtype} 삭제 예정 {len(chunk)}개: {chunk[:5]}{'…' if len(chunk) > 5 else ''}")
            done.update(chunk)
            continue
        qs = urllib.parse.urlencode([("public_ids[]", p) for p in chunk])
        url = f"{API}/resources/{rtype}/upload?{qs}"
        try:
            data = req(url, method="DELETE")
            for pid, status in (data.get("deleted") or {}).items():
                if status in ("deleted", "not_found"):
                    done.add(pid)
            print(f"  [{rtype}] 삭제 {len(chunk)}개 요청 완료")
        except urllib.error.HTTPError as e:
            print(f"  [{rtype}] delete 오류 {e.code}: {e.read().decode()[:200]}")
    return done


def fb_cleanup(deleted_ids):
    """삭제된 Cloudinary public_id에 해당하는 Firebase /photos 레코드 제거."""
    if not FB_URL or not deleted_ids:
        return 0
    try:
        with urllib.request.urlopen(f"{FB_URL}/photos.json", timeout=60) as resp:
            photos = json.load(resp) or {}
    except Exception as e:
        print(f"  Firebase 읽기 오류: {e}")
        return 0
    removed = 0
    for key, val in (photos or {}).items():
        if isinstance(val, dict) and val.get("publicId") in deleted_ids:
            if DRY:
                print(f"  [DRY] Firebase photos/{key} 제거 예정")
                removed += 1
                continue
            try:
                urllib.request.urlopen(urllib.request.Request(f"{FB_URL}/photos/{key}.json", method="DELETE"), timeout=30).read()
                removed += 1
            except Exception as e:
                print(f"  Firebase 삭제 오류 photos/{key}: {e}")
    return removed


def main():
    print(f"== 앨범 자동삭제 시작 (기준: {MAX_AGE}h 경과, cutoff={cutoff.isoformat()}, tag={TAG}, dry_run={DRY}) ==")
    all_deleted = set()
    for rtype in ("image", "video"):
        old = list_old(rtype)
        print(f"[{rtype}] 삭제 대상 {len(old)}개")
        if old:
            all_deleted |= delete_batch(rtype, old)
    removed = fb_cleanup(all_deleted)
    print(f"== 완료: Cloudinary {len(all_deleted)}개, Firebase 레코드 {removed}개 정리 ==")


if __name__ == "__main__":
    main()
