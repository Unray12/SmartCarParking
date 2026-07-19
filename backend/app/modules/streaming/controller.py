from __future__ import annotations

from urllib.parse import parse_qs

from fastapi import APIRouter, Request, Response

from app.core.config import get_settings
from app.modules.auth.security import decode_token

# Router PUBLIC (không gắn Depends(get_current_user) ở router.py) - endpoint dưới đây do
# CHÍNH MediaMTX gọi server-to-server, không phải browser, nên không thể mang Bearer token.
# Bảo mật nằm ở chỗ: chỉ chấp nhận khi token trong query là JWT hợp lệ (browser) hoặc token
# nội bộ (AI worker/fallback đọc RTSP re-publish). MediaMTX Control API (:9997) KHÔNG map ra
# host nên action 'api' chỉ có thể tới từ backend trong docker network.
router = APIRouter(prefix="/streaming", tags=["streaming"])


def _token_from_query(query: str) -> str | None:
    if not query:
        return None
    values = parse_qs(query).get("token")
    return values[0] if values else None


def _token_is_valid(token: str | None) -> bool:
    if not token:
        return False
    settings = get_settings()
    # Token nội bộ dùng chung cho AI worker/fallback đọc RTSP re-publish.
    if token == settings.stream_internal_token:
        return True
    # Hoặc JWT hợp lệ của người dùng đã đăng nhập (browser xem WebRTC).
    payload = decode_token(token)
    return bool(payload and payload.get("sub"))


@router.post("/mediamtx-auth")
async def mediamtx_auth(request: Request) -> Response:
    """MediaMTX POST tới đây trước MỖI hành động (đọc WebRTC/RTSP, gọi Control API...) để
    hỏi có cho phép không. Trả 2xx = cho phép, 401 = từ chối."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    action = str(body.get("action") or "")
    query = str(body.get("query") or "")

    # Control API/metrics: cổng 9997 không expose ra host -> chỉ backend trong docker network
    # gọi được, cho phép. (Không được chặn, nếu không backend không quản lý path được.)
    if action in ("api", "metrics", "pprof"):
        return Response(status_code=204)

    # Không nhận publisher từ ngoài: nguồn camera do MediaMTX tự kéo (server-side, không qua
    # auth này); mọi 'publish' tới auth này đều là bất thường -> từ chối.
    if action == "publish":
        return Response(status_code=401)

    # Đọc stream (WebRTC từ browser, hoặc RTSP re-publish cho AI/fallback): cần token hợp lệ.
    if action in ("read", "playback"):
        if _token_is_valid(_token_from_query(query)):
            return Response(status_code=204)
        return Response(status_code=401)

    return Response(status_code=401)
