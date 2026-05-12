import ollama
import base64

# Create a small valid 1x1 png base64
png_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

try:
    response = ollama.chat(
        model='llama3.2-vision',
        messages=[
            {
                'role': 'user',
                'content': 'What is this image?',
                'images': [png_base64]
            }
        ]
    )
    print("Base64 worked:", response['message']['content'])
except Exception as e:
    print("Base64 error:", e)

with open("test.png", "wb") as f:
    f.write(base64.b64decode(png_base64))

try:
    response2 = ollama.chat(
        model='llama3.2-vision',
        messages=[
            {
                'role': 'user',
                'content': 'What is this image?',
                'images': ['test.png']
            }
        ]
    )
    print("File path worked:", response2['message']['content'])
except Exception as e:
    print("File path error:", e)
