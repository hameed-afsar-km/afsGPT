import asyncio
import os
import speech_recognition as sr
import edge_tts
import pygame
from langchain_ollama.llms import OllamaLLM

llm = OllamaLLM(
    model="gemma2:2b",
    system="""
    You are a professional AI assistant.
    Do not use emojis in any response.
    Keep responses clean and technical.
    """
)
pygame.mixer.init()

VOICE = "en-US-AvaNeural"
OUTPUT_FILE = "response.mp3"

async def text_to_speech(text):
    print(f"\nAI: {text}")
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(OUTPUT_FILE)
    
    pygame.mixer.music.load(OUTPUT_FILE)
    pygame.mixer.music.play()
    
    while pygame.mixer.music.get_busy():
        await asyncio.sleep(0.1)
    
    pygame.mixer.music.unload()
    if os.path.exists(OUTPUT_FILE):
        os.remove(OUTPUT_FILE)

def speech_to_text():
    recognizer = sr.Recognizer()
    with sr.Microphone() as source:
        print("\n[Speech to Text] Listening... Please speak now.")
        recognizer.adjust_for_ambient_noise(source)
        try:
            audio = recognizer.listen(source, timeout=5)
            text = recognizer.recognize_google(audio)
            print(f"=> You said: {text}")
            return text
        except sr.UnknownValueError:
            print("=> Sorry, I could not understand the audio.")
            return None
        except sr.RequestError as e:
            print(f"=> Could not request results; {e}")
            return None
        except sr.WaitTimeoutError:
            print("=> Listening timed out while waiting for phrase to start")
            return None

async def main():
    print("--- Ollama + Edge-TTS Voice Assistant Started (Say 'quit' or 'exit' to stop) ---")

    while True:
        loop = asyncio.get_event_loop()
        user_query = await loop.run_in_executor(None, speech_to_text)
        
        if user_query:
            if user_query.lower() in ["quit", "exit"]:
                print("Goodbye!")
                break

            try:
                response = await loop.run_in_executor(None, llm.invoke, user_query)
                await text_to_speech(response)
            except Exception as e:
                print(f"\nError: {e}")
        else:
            continue

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nProgram stopped by user.")
    finally:
        pygame.mixer.quit()
        if os.path.exists(OUTPUT_FILE):
            try:
                os.remove(OUTPUT_FILE)
            except:
                pass
