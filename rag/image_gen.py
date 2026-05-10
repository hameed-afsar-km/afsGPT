import os
import requests
import uuid
import logging
import time

log = logging.getLogger(__name__)

HF_TOKEN = os.environ.get("HF_TOKEN", "")

def enhance_prompt_with_ollama(user_prompt: str) -> str:
    """Uses Qwen2.5-Coder to rewrite the user prompt for FLUX."""
    system_prompt = (
        "You are an expert text-to-image prompt engineer. Your task is to take "
        "the user's request and create a highly detailed, descriptive prompt "
        "optimized for FLUX.1. Output ONLY the raw prompt text, no explanations, "
        "no conversational filler, no markdown formatting."
    )
    try:
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "qwen2.5-coder:7b",
                "prompt": user_prompt,
                "system": system_prompt,
                "stream": False
            },
            timeout=30
        )
        if response.ok:
            enhanced = response.json().get("response", "").strip()
            log.info(f"Enhanced prompt: {enhanced}")
            return enhanced if enhanced else user_prompt
    except Exception as e:
        log.error(f"Failed to enhance prompt with Ollama: {e}")
    return user_prompt

def generate_image(prompt: str, save_dir: str) -> dict:
    """Generates an image using FLUX.1-dev and saves it."""
    if not HF_TOKEN:
        return {"error": "HF_TOKEN environment variable not set. Please set it to use image generation."}

    enhanced_prompt = enhance_prompt_with_ollama(prompt)

    # Clean token in case it has literal quotes from environment
    clean_token = HF_TOKEN.strip().strip('"').strip("'")
    
    api_url = "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell"
    headers = {
        "Authorization": f"Bearer {clean_token}",
        "Content-Type": "application/json"
    }
    payload = {
        "inputs": enhanced_prompt,
        "parameters": {
            "guidance_scale": 0.0,
            "num_inference_steps": 4,
            "max_sequence_length": 256
        }
    }

    max_retries = 5
    retry_delay = 5

    for attempt in range(max_retries):
        try:
            log.info(f"Generating image (attempt {attempt + 1}/{max_retries})...")
            response = requests.post(api_url, headers=headers, json=payload, timeout=60)
            
            if response.ok:
                os.makedirs(save_dir, exist_ok=True)
                filename = f"{uuid.uuid4().hex}.jpg"
                save_path = os.path.join(save_dir, filename)
                
                with open(save_path, "wb") as f:
                    f.write(response.content)
                
                log.info(f"Image generated successfully: {filename}")
                return {
                    "success": True,
                    "filename": filename,
                    "url": f"/static/images/{filename}",
                    "enhanced_prompt": enhanced_prompt
                }
            
            status_code = response.status_code
            response_text = response.text
            
            if status_code == 503:
                log.warning(f"HF Model is loading (503). Retrying in {retry_delay}s...")
                time.sleep(retry_delay)
                continue
            
            log.error(f"Hugging Face API Error ({status_code}): {response_text}")
            return {"error": f"Hugging Face API Error: {response_text}"}
            
        except Exception as e:
            log.error(f"Attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
            else:
                return {"error": f"Image generation failed after {max_retries} attempts: {str(e)}"}

    return {"error": "Image generation failed: Max retries exceeded (model likely taking too long to load)."}
