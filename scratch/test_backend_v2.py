
import requests
import base64
import io
from PIL import Image

def test_analyze_image():
    url = "http://127.0.0.1:8001/analyze-image"
    
    # Create a valid small 100x100 red square
    img = Image.new('RGB', (100, 100), color = 'red')
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    
    payload = {
        "image_base64": f"data:image/png;base64,{img_str}",
        "question": "What color is this square?"
    }
    
    try:
        print(f"Sending request to {url}...")
        # Now 60s should be plenty
        response = requests.post(url, json=payload, timeout=60)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_analyze_image()
