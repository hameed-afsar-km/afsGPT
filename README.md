# afsGPT

A premium AI Voice Interface built with LangGraph, Python, and Next.js.

## Overview
afsGPT is a sophisticated voice chat application that features:
- **Real-time Voice Interaction**: Seamless speech-to-text and text-to-speech.
- **Glassmorphic UI**: A modern, premium design with grain effects and dynamic gradients.
- **Secure Authentication**: Integrated with Google Auth via Firebase.
- **Chat History**: Persistent conversation storage using Firestore.

## Project Structure
- `/frontend`: Next.js application with TailwindCSS and Framer Motion.
- `main.py`: Backend logic for voice processing and LangGraph orchestration.
- `requirements.txt`: Python dependencies.

## Setup
1. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. **Backend**:
   ```bash
   pip install -r requirements.txt
   python main.py
   ```

## License
MIT
