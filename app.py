from __future__ import annotations

import io
import json
import os
import re
import base64
import requests
from pathlib import Path
from dotenv import load_dotenv

import fitz
from flask import Flask, jsonify, request, send_from_directory

load_dotenv()

# API Key is now securely loaded from .env
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")


@app.route("/")
def serve_index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:filename>")
def serve_static(filename: str):
    return send_from_directory(BASE_DIR, filename)


@app.post("/api/read-pan")
def read_pan():
    uploaded_file = request.files.get("file")
    if uploaded_file is None or uploaded_file.filename == "":
        return jsonify({"error": "Please upload a PDF file."}), 400

    if not uploaded_file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF files are supported."}), 400

    pdf_bytes = uploaded_file.read()
    if not pdf_bytes:
        return jsonify({"error": "Uploaded file is empty."}), 400

    if not OPENROUTER_API_KEY or OPENROUTER_API_KEY == "YOUR_OPENROUTER_API_KEY_HERE":
        return jsonify({"error": "Please set OPENROUTER_API_KEY in .env"}), 500

    try:
        document = fitz.open(stream=pdf_bytes, filetype="pdf")
        b64_images = []
        for page in document:
            pixmap = page.get_pixmap(matrix=fitz.Matrix(1, 1), alpha=False)
            img_bytes = pixmap.tobytes("jpeg", 85)
            b64_images.append(base64.b64encode(img_bytes).decode("utf-8"))

        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        }

        prompt = f'''
        You are an expert Vision AI and document extractor. 
        I am providing {len(b64_images)} images of PAN cards from a multi-page document.
        For each image, diligently extract the following:
        - "panNumber": The 10-character alphanumeric PAN ID (format: 5 letters, 4 numbers, 1 letter. e.g., ABCDE1234F).
        - "holderName": The full English name of the person. Do NOT include Hindi characters, labels like "Name", or random watermarks like "SAMPLE, IMMIHELP.COM, SIGNATURE, AMT MAIA".
        - "dateOfBirth": Date of birth strictly in DD/MM/YYYY format.
        - "fatherName": The English name of the father (ignore Hindi translations).

        IMPORTANT RULES:
        1. If a field is entirely missing or unreadable, output "Not found".
        2. Ignore watermarks overlaying the text.
        3. Return ONLY a valid JSON array containing exactly {len(b64_images)} objects, sequentially matching the images provided.
        4. Each JSON object MUST have these exact 4 keys: "panNumber", "holderName", "dateOfBirth", "fatherName".
        5. Do NOT include any markdown blocks (like `json), output raw JSON only.
        DO NOT include <reasoning> blocks, only return raw JSON array.
        '''

        content_list = [{"type": "text", "text": prompt}]
        for b64 in b64_images:
            content_list.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
            })

        data = {
            "model": "nvidia/nemotron-nano-12b-v2-vl:free",
            "messages": [{"role": "user", "content": content_list}],
            "temperature": 0.0
        }
        # Fallbacks:
        # "meta-llama/llama-3.2-11b-vision-instruct:free"
        # "google/gemini-2.0-pro-exp-02-05:free"

        response = requests.post(url, headers=headers, json=data, timeout=60)
        if not response.ok:
            print("Response text:", response.text)
        response.raise_for_status()
        
        content = response.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
        if content.startswith("`"):
            content = re.sub(r"^`(?:json)?|`$", "", content).strip()

        details_list = json.loads(content)
        if isinstance(details_list, dict):
            details_list = [details_list]

        return jsonify({"details": details_list, "raw_text": "Extracted via blazing fast Vision LLM"})
    except Exception as exc:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Vision OCR failed: {exc}"}), 500

if __name__ == "__main__":
    app.run(debug=False, use_reloader=False, host="127.0.0.1", port=5000)
