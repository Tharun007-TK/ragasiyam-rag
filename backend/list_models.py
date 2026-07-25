import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.environ["GEMINI_API_KEY"])

for m in genai.list_models():
    print(f"{m.name} -> {m.supported_generation_methods}")
