#!/usr/bin/env python3
"""
Patch: baseUploads in Profile.js keeps the "/api" suffix from api.defaults.baseURL,
so every profile/degree/signature URL is built as ".../api/uploads/...". Confirmed
live that nginx serves /uploads/* directly (no /api prefix) — the /api-prefixed
version 404s. Strip a trailing "/api" before appending "/uploads/".

Run as: sudo python3 patch_profile_baseuploads.py
Creates a .bak backup before writing.
"""
import shutil

TARGET = "/home/ubuntu/onix/frontend/src/modules/radiologist/pages/Profile.js"

OLD = '''  // Keep the /api prefix so the Vite dev proxy forwards uploads to FastAPI's
  // StaticFiles mount. Stripping /api makes the URL hit Vite's SPA fallback
  // (returns index.html, not the image), which is why the avatar fails to load.
  const baseUploads = useMemo(() => {
    const b = (api?.defaults?.baseURL || "").replace(/\\/$/, "");
    if (!b) return `${window.location.origin}/uploads/`;
    return `${b}/uploads/`;
  }, []);'''

NEW = '''  // In production, nginx proxies /uploads/* straight to the backend's static
  // mount — it is NOT behind /api (confirmed: https://onixai.in/uploads/...
  // works, https://onixai.in/api/uploads/... 404s). api.defaults.baseURL ends
  // in "/api", so that suffix has to come off before appending "/uploads/".
  const baseUploads = useMemo(() => {
    const b = (api?.defaults?.baseURL || "").replace(/\\/$/, "").replace(/\\/api$/i, "");
    if (!b) return `${window.location.origin}/uploads/`;
    return `${b}/uploads/`;
  }, []);'''


def main():
    with open(TARGET, "r") as f:
        content = f.read()

    if NEW in content:
        print("Already patched — nothing to do.")
        return

    if OLD not in content:
        print("ABORTING — expected baseUploads block not found. File may differ from what I expect.")
        raise SystemExit(1)

    shutil.copy(TARGET, TARGET + ".bak2")
    print(f"Backed up to {TARGET}.bak2")

    content = content.replace(OLD, NEW)

    with open(TARGET, "w") as f:
        f.write(content)

    print(f"Patched {TARGET}")


if __name__ == "__main__":
    main()

