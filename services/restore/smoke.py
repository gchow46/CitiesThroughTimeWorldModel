# modal run services/restore/smoke.py
# Feeds a small synthetic "old scan" through the restorer and reports sizes.

import io

import modal
from PIL import Image, ImageFilter

app = modal.App("ctt-restore-smoke")

restore_app = modal.App.lookup("ctt-restore", create_if_missing=False)


@app.local_entrypoint()
def main():
    from app import Restorer  # same module dir on the modal runner

    # Fake a low-res, noisy 1920s-style scan.
    img = Image.new("RGB", (640, 360), (120, 100, 80))
    img = img.filter(ImageFilter.GaussianBlur(2)).resize((320, 180))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=60)

    restored, ms = Restorer().restore.remote(buf.getvalue(), 1280)
    out = Image.open(io.BytesIO(restored))
    print(f"input 640→downscaled 320px scan → restored {out.size} in {ms}ms")
    assert out.width == 1280, "expected 1280px wide output"
    print("smoke ok")
