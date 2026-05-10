import requests
import os
from dotenv import load_dotenv

load_dotenv()
token = os.environ.get("HF_TOKEN", "").strip().strip('"').strip("'")

urls = [
    "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-3.5-large",
    "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0",
    "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-3.5-large"
]

headers = {"Authorization": f"Bearer {token}"}
payload = {"inputs": "A beautiful cat"}

for u in urls:
    print(f"Testing {u}...")
    r = requests.post(u, headers=headers, json=payload)
    print(r.status_code, r.text[:200])
