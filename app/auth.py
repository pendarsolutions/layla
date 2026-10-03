"""Sign-in and sessions.

- Google: the page gets an ID token from Google Identity Services and posts it here; we verify its signature against
  Google's published keys, the audience (our client id), the issuer and the expiry.
- Session: a signed, short-lived JWT in an httpOnly, SameSite=Lax cookie. Nothing is stored server-side, so any
  instance can serve any request. Logout clears the cookie; a stolen cookie stays valid until it expires.
"""
import time
from typing import Optional

import jwt

COOKIE = "layla_session"
GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")
GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs"


class GoogleVerifier:
    def __init__(self, client_id: str):
        self.client_id = client_id
        self._jwks = jwt.PyJWKClient(GOOGLE_CERTS, cache_keys=True, lifespan=3600) if client_id else None

    def __call__(self, credential: str) -> dict:
        """-> {sub, email, name, picture}. Raises ValueError on anything invalid."""
        if not self._jwks:
            raise ValueError("Google sign-in is not configured")
        try:
            key = self._jwks.get_signing_key_from_jwt(credential).key
            claims = jwt.decode(credential, key, algorithms=["RS256"], audience=self.client_id,
                                options={"require": ["exp", "iat", "sub", "email"]})
        except jwt.PyJWTError as e:
            raise ValueError(f"invalid Google token: {e}") from e
        if claims.get("iss") not in GOOGLE_ISSUERS:
            raise ValueError("invalid Google token issuer")
        if not claims.get("email_verified"):
            raise ValueError("Google account email is not verified")
        return {"sub": claims["sub"], "email": claims["email"], "name": claims.get("name", ""),
                "picture": claims.get("picture", "")}


class Sessions:
    def __init__(self, secret: str, days: int, secure: bool):
        if len(secret) < 32:
            raise ValueError("LAYLA_SESSION_SECRET must be at least 32 characters")
        self.secret, self.ttl, self.secure = secret, days * 86400, secure

    def issue(self, user_id: int) -> str:
        now = int(time.time())
        return jwt.encode({"sub": str(user_id), "iat": now, "exp": now + self.ttl, "typ": "session"},
                          self.secret, algorithm="HS256")

    def read(self, token: Optional[str]) -> Optional[int]:
        if not token:
            return None
        try:
            c = jwt.decode(token, self.secret, algorithms=["HS256"], options={"require": ["exp", "sub"]})
        except jwt.PyJWTError:
            return None
        return int(c["sub"]) if c.get("typ") == "session" else None

    def set_cookie(self, response, token: str):
        response.set_cookie(COOKIE, token, max_age=self.ttl, httponly=True, secure=self.secure,
                            samesite="lax", path="/")

    def clear_cookie(self, response):
        response.delete_cookie(COOKIE, path="/", httponly=True, secure=self.secure, samesite="lax")
