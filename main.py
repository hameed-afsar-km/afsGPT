# pyrefly: ignore [missing-import]
import speech_recognition as sr
import pyttsx3
import sys

def speech_to_text():
    recognizer = sr.Recognizer()
    with sr.Microphone() as source:
        print("\n[Speech to Text] Listening... Please speak now.")
        recognizer.adjust_for_ambient_noise(source)
        try:
            audio = recognizer.listen(source, timeout=5)
            text = recognizer.recognize_google(audio)
            print(f"=> You said: {text}")
        except sr.UnknownValueError:
            print("=> Sorry, I could not understand the audio.")
        except sr.RequestError as e:
            print(f"=> Could not request results; {e}")
        except sr.WaitTimeoutError:
            print("=> Listening timed out while waiting for phrase to start")

def text_to_speech():
    engine = pyttsx3.init()
    text = input("\n[Text to Speech] Enter text to speak: ")
    if text.strip():
        engine.say(text)
        engine.runAndWait()
    else:
        print("=> No text entered.")

if __name__ == "__main__":
    print("Welcome to Simple Voice Project!")
    while True:
        print("\n--- Menu ---")
        print("1. Speech to Text (Speak to print text)")
        print("2. Text to Speech (Type to output speech)")
        print("3. Exit")
        
        choice = input("Select an option (1/2/3): ")
        
        if choice == '1':
            speech_to_text()
        elif choice == '2':
            text_to_speech()
        elif choice == '3':
            print("Exiting...")
            sys.exit(0)
        else:
            print("Invalid choice. Please try again.")
