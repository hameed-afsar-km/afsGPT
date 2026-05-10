import requests
import os
from dotenv import load_dotenv

load_dotenv()
token = os.environ.get("HF_TOKEN", "").strip().strip('"').strip("'")

# Test FLUX dev on api-inference
url1 = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev"
# Test SD3.5 on api-inference
url2 = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-3.5-large"
url3 = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0"

headers = {"Authorization": f"Bearer {token}"}
payload = {"inputs": "A beautiful cat"}

print("Testing FLUX.1-dev...")
r1 = requests.post(url1, headers=headers, json=payload)
print(r1.status_code, r1.text[:200])

print("\nTesting SD3.5 Large...")
r2 = requests.post(url2, headers=headers, json=payload)
print(r2.status_code, r2.text[:200])

print("\nTesting SDXL...")
r3 = requests.post(url3, headers=headers, json=payload)
print(r3.status_code, r3.text[:200])
