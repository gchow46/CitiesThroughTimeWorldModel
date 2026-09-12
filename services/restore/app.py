# B9 — optional GPU restoration endpoint on Modal.
#
# POST {imageBase64, targetWidth} → JPEG bytes (Content-Type: image/jpeg).
# The Next.js caller (lib/image.ts) uploads the result to blob storage itself,
# so this service stays stateless. Auth: Bearer $RESTORE_KEY.
#
# Deploy:  modal deploy services/restore/app.py
# Smoke:   modal run services/restore/smoke.py

import io
import os
import time

import modal

app = modal.App("ctt-restore")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install(
        "realesrgan==0.3.0",
        "basicsr==1.4.2",
        "opencv-python-headless",
        "pillow",
        "torch",
        "torchvision",
        "fastapi[standard]",
    )
)

MODEL_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
MODEL_DIR = "/models"


@app.cls(gpu="A10G", image=image, scaledown_window=300)
class Restorer:
    @modal.enter()
    def load(self):
        import urllib.request
        from basicsr.archs.rrdbnet_arch import RRDBNet
        from realesrgan import RealESRGANer

        os.makedirs(MODEL_DIR, exist_ok=True)
        model_path = os.path.join(MODEL_DIR, "RealESRGAN_x4plus.pth")
        if not os.path.exists(model_path):
            urllib.request.urlretrieve(MODEL_URL, model_path)

        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
        self.upsampler = RealESRGANer(
            scale=4,
            model_path=model_path,
            model=model,
            tile=256,
            pre_pad=0,
            half=True,
        )

    @modal.method()
    def restore(self, image_bytes: bytes, target_width: int) -> tuple[bytes, int]:
        import numpy as np
        from PIL import Image

        t0 = time.time()
        src = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        arr = np.array(src)
        out, _ = self.upsampler.enhance(arr, outscale=4)

        img = Image.fromarray(out)
        if img.width > target_width:
            h = round(img.height * target_width / img.width)
            img = img.resize((target_width, h), Image.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=92)
        return buf.getvalue(), int((time.time() - t0) * 1000)


@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def web(request: dict) -> "object":
    from fastapi.responses import Response

    image_b64 = request.get("imageBase64")
    target_width = int(request.get("targetWidth", 1280))
    if not image_b64:
        return Response("missing imageBase64", status_code=400)

    import base64

    data = base64.b64decode(image_b64)
    restored, ms = Restorer().restore.remote(data, target_width)
    return Response(restored, media_type="image/jpeg", headers={"x-restore-ms": str(ms)})


# NOTE: callers send Bearer $RESTORE_KEY; enforce it when the endpoint is
# deployed (Modal proxy auth or a check here). Kept minimal for the B9 spike.
