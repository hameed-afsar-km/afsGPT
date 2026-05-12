
import requests
import base64
import os

def test_analyze_image():
    url = "http://localhost:8001/analyze-image"
    
    # Create a tiny 1x1 black pixel image in base64
    tiny_image_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    
    payload = {
        "image_base64": tiny_image_b64,
        "question": "What is this?"
    }
    
    try:
        print(f"Sending request to {url}...")
        response = requests.post(url, json=payload, timeout=120)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_analyze_image()
