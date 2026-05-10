import requests
import os
from dotenv import load_dotenv

load_dotenv()
token = os.environ.get("HF_TOKEN", "").strip().strip('"').strip("'")

url = "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell"

headers = {"Authorization": f"Bearer {token}"}
payload = {"inputs": "A beautiful cat", "parameters": {"guidance_scale": 0.0, "num_inference_steps": 4}}

print(f"Testing {url}...")
r = requests.post(url, headers=headers, json=payload)
print(r.status_code, r.headers.get("content-type"))
